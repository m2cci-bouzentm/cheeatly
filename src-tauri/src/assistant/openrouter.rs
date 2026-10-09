use anyhow::{Context, Result, bail};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;

use crate::settings::StoredCredentials;

#[derive(Clone)]
pub struct OpenRouter {
    client: reqwest::Client,
}

#[derive(Deserialize)]
struct Response {
    choices: Vec<Choice>,
}
#[derive(Deserialize)]
struct Choice {
    message: Message,
}
#[derive(Deserialize)]
struct Message {
    content: Option<String>,
}

impl OpenRouter {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    pub async fn stream(
        &self,
        credentials: &StoredCredentials,
        mut messages: Vec<Value>,
        skills: &[crate::database::SkillRow],
        mut delta: impl FnMut(&str) -> Result<()>,
    ) -> Result<String> {
        let key = credentials
            .open_router_api_key
            .as_deref()
            .filter(|key| !key.trim().is_empty())
            .context("No OpenRouter API key configured")?;
        let model = credentials
            .default_model
            .as_deref()
            .unwrap_or("qwen/qwen3.7-flash");
        let mut text = String::new();
        for step in 0..3 {
            let mut body = json!({"model":model,"messages":messages,"stream":true});
            if !skills.is_empty() {
                body["tools"] = json!([{"type":"function","function":{"name":"retrieveSkill","description":"Retrieve specialized instructions by skill name","parameters":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}}}]);
                if step == 2 {
                    body["tool_choice"] = json!("none");
                }
            }
            let mut response = self
                .client
                .post("https://openrouter.ai/api/v1/chat/completions")
                .timeout(Duration::from_secs(60))
                .bearer_auth(key)
                .json(&body)
                .send()
                .await?;
            if !response.status().is_success() {
                bail!("OpenRouter returned HTTP {}", response.status());
            }
            let mut decoder = StreamDecoder::default();
            let mut step_text = String::new();
            while let Some(bytes) = response.chunk().await? {
                for part in decoder.push(&bytes)? {
                    delta(&part)?;
                    step_text.push_str(&part);
                    text.push_str(&part);
                }
                if decoder.done {
                    break;
                }
            }
            anyhow::ensure!(decoder.done, "OpenRouter stream ended before completion");
            if decoder.calls.is_empty() {
                return Ok(text);
            }
            let calls = decoder.calls.into_values().collect::<Vec<_>>();
            messages.push(json!({"role":"assistant","content":step_text,"tool_calls":calls.iter().map(|call| json!({"id":call.id,"type":"function","function":{"name":call.name,"arguments":call.arguments}})).collect::<Vec<_>>()}));
            for call in calls {
                let arguments: Value = serde_json::from_str(&call.arguments)?;
                let name = arguments
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let result = if call.name == "retrieveSkill" {
                    skills
                        .iter()
                        .find(|skill| skill.enabled && skill.name == name)
                        .map(|skill| json!({"skill":name,"content":skill.content}))
                        .unwrap_or_else(|| json!({"error":"Skill unavailable"}))
                } else {
                    json!({"error":"Unknown tool"})
                };
                messages.push(
                    json!({"role":"tool","tool_call_id":call.id,"content":result.to_string()}),
                );
            }
        }
        bail!("Assistant exceeded the skill retrieval limit")
    }

    pub async fn complete(
        &self,
        credentials: &StoredCredentials,
        messages: Vec<Value>,
    ) -> Result<String> {
        let key = credentials
            .open_router_api_key
            .as_deref()
            .filter(|key| !key.trim().is_empty())
            .context("No OpenRouter API key configured")?;
        let model = credentials
            .default_model
            .as_deref()
            .unwrap_or("qwen/qwen3.7-flash");
        let response = self
            .client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .timeout(Duration::from_secs(60))
            .bearer_auth(key)
            .json(&json!({"model": model, "messages": messages}))
            .send()
            .await?;
        if !response.status().is_success() {
            // Do not log provider response bodies, prompts, or credentials.
            bail!("OpenRouter returned HTTP {}", response.status());
        }
        response
            .json::<Response>()
            .await?
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message.content)
            .filter(|text| !text.trim().is_empty())
            .context("OpenRouter returned no text")
    }
}

#[derive(Default)]
struct StreamDecoder {
    pending: Vec<u8>,
    done: bool,
    calls: std::collections::BTreeMap<usize, ToolCall>,
}
#[derive(Default)]
struct ToolCall {
    id: String,
    name: String,
    arguments: String,
}

impl StreamDecoder {
    fn push(&mut self, bytes: &[u8]) -> Result<Vec<String>> {
        self.pending.extend_from_slice(bytes);
        anyhow::ensure!(
            self.pending.len() <= 4 * 1024 * 1024,
            "OpenRouter event exceeds size limit"
        );
        let mut chunks = Vec::new();
        while let Some(end) = self.pending.iter().position(|byte| *byte == b'\n') {
            let line = self.pending.drain(..=end).collect::<Vec<_>>();
            let line = std::str::from_utf8(&line)?.trim();
            let Some(data) = line.strip_prefix("data:").map(str::trim) else {
                continue;
            };
            if data == "[DONE]" {
                self.done = true;
                break;
            }
            if data.is_empty() {
                continue;
            }
            let value: Value = serde_json::from_str(data)?;
            if value.get("error").is_some() {
                bail!("OpenRouter stream reported an error");
            }
            if let Some(calls) = value
                .pointer("/choices/0/delta/tool_calls")
                .and_then(Value::as_array)
            {
                for call in calls {
                    let index =
                        call.get("index")
                            .and_then(Value::as_u64)
                            .context("Missing tool call index")? as usize;
                    anyhow::ensure!(index < 32, "Too many tool calls");
                    let entry = self.calls.entry(index).or_default();
                    if let Some(id) = call.get("id").and_then(Value::as_str) {
                        entry.id.push_str(id);
                    }
                    if let Some(name) = call.pointer("/function/name").and_then(Value::as_str) {
                        entry.name.push_str(name);
                    }
                    if let Some(args) = call.pointer("/function/arguments").and_then(Value::as_str)
                    {
                        entry.arguments.push_str(args);
                    }
                    anyhow::ensure!(entry.arguments.len() <= 65536, "Tool arguments too large");
                }
            }
            if let Some(text) = value
                .pointer("/choices/0/delta/content")
                .and_then(Value::as_str)
            {
                chunks.push(text.to_owned());
            }
        }
        Ok(chunks)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stream_decodes_split_utf8_crlf_and_provider_errors() {
        let stream =
            "data: {\"choices\":[{\"delta\":{\"content\":\"café\"}}]}\r\n\r\ndata: [DONE]\n\n";
        let mut decoder = StreamDecoder::default();
        let mut text = String::new();
        for byte in stream.as_bytes() {
            text.push_str(&decoder.push(&[*byte]).unwrap().concat());
        }
        assert_eq!(text, "café");
        assert!(decoder.done);
        assert!(
            StreamDecoder::default()
                .push(b"data: {\"error\":{}}\n")
                .is_err()
        );
    }
}
