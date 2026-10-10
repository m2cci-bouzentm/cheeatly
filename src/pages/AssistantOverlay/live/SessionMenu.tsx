import React from 'react';
import { OPENROUTER_MODELS } from '../../../utils/modelUtils';
import { BackIcon, TrashIcon } from './icons.tsx';

type SessionMenuProps = {
  micOn: boolean;
  callAudioOn: boolean;
  undetectable: boolean;
  model: string;
  onMic: (on: boolean) => void;
  onCallAudio: (on: boolean) => void;
  onUndetectable: (on: boolean) => void;
  onModel: (id: string) => void;
  onBackToApp: () => void;
  onDiscard: () => void;
  onClose: () => void;
};

// v1 Session options (kept), now owned by the pill: toggles, model, then the two session actions as buttons.
const SessionMenu: React.FC<SessionMenuProps> = ({
  micOn,
  callAudioOn,
  undetectable,
  model,
  onMic,
  onCallAudio,
  onUndetectable,
  onModel,
  onBackToApp,
  onDiscard,
  onClose,
}) => (
  <div className="popover session-menu no-drag" data-overlay-popup>
    <button className="close" aria-label="Close menu" data-tip="Close" onClick={onClose}>
      ×
    </button>
    <h3>Session options</h3>
    <label>
      Capture my microphone
      <input type="checkbox" className="sw" role="switch" checked={micOn} onChange={(e) => onMic(e.target.checked)} />
    </label>
    <label>
      Capture call audio
      <input
        type="checkbox"
        className="sw"
        role="switch"
        checked={callAudioOn}
        onChange={(e) => onCallAudio(e.target.checked)}
      />
    </label>
    <label>
      Undetectable
      <input
        type="checkbox"
        className="sw"
        role="switch"
        checked={undetectable}
        onChange={(e) => onUndetectable(e.target.checked)}
      />
    </label>
    <label htmlFor="lc-model">Model</label>
    <select id="lc-model" value={model} onChange={(e) => onModel(e.target.value)}>
      {OPENROUTER_MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
    <div className="menu-btns">
      <button className="menu-btn" onClick={onBackToApp}>
        <BackIcon />
        Back to app
      </button>
      <button className="menu-btn danger" onClick={onDiscard}>
        <TrashIcon />
        Discard session
      </button>
    </div>
  </div>
);

export default SessionMenu;
