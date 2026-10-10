import React from 'react';
import type { AttachmentContext } from '../types.ts';
import { BoltIcon, CameraIcon, DownIcon, LoaderIcon, UpIcon, XIcon } from './icons.tsx';

export type ConversationView = 'chat' | 'transcript';

type ConversationPanelProps = {
  view: ConversationView;
  onView: (view: ConversationView) => void;
  engineLoading: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  maxHeight: number;
  more: boolean;
  onScrollToEnd: () => void;
  busy: boolean;
  attachments: AttachmentContext[];
  onRemoveAttachment: (path: string) => void;
  notices: React.ReactNode;
  input: React.ReactNode;
  quickActionsOpen: boolean;
  quickActions: React.ReactNode;
  onToggleQuickActions: () => void;
  onAttachScreenshot: () => void;
  screenshotTip: string;
  onSubmit: () => void;
  children: React.ReactNode;
};

const TABS: [ConversationView, string][] = [
  ['chat', 'Chat'],
  ['transcript', 'Transcript'],
];

// Answer panel: Chat / Transcript tabs (v18), the scrollable body, then the v1 footer with the
// screenshot tray and the composer (⚡ quick actions, camera, input, send).
const ConversationPanel: React.FC<ConversationPanelProps> = ({
  view,
  onView,
  engineLoading,
  scrollRef,
  maxHeight,
  more,
  onScrollToEnd,
  busy,
  attachments,
  onRemoveAttachment,
  notices,
  input,
  quickActionsOpen,
  quickActions,
  onToggleQuickActions,
  onAttachScreenshot,
  screenshotTip,
  onSubmit,
  children,
}) => (
  <section className="panel main" aria-label="Assistant">
    <div className="main-header">
      <div className="tabs" role="tablist" aria-label="Conversation view">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className="tab"
            role="tab"
            aria-selected={view === id}
            aria-controls="lc-thread"
            onClick={() => onView(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    <div className="scrollwrap">
      <div
        ref={scrollRef}
        id="lc-thread"
        className={more ? 'lc-thread more' : 'lc-thread'}
        style={{ maxHeight }}
        role="region"
        aria-label="Assistant content"
        aria-busy={busy}
      >
        {engineLoading && (
          <p className="engine" role="status">
            <LoaderIcon />
            Loading local engine…
          </p>
        )}
        {children}
      </div>
      {more && (
        <button className="down" data-tip="More below" aria-label="Scroll answer to the end" onClick={onScrollToEnd}>
          <DownIcon />
        </button>
      )}
    </div>
    <div className="foot">
      {notices}
      {attachments.length > 0 && (
        <div className="attachments">
          {attachments.map((attachment) => (
            <div key={attachment.path} className="thumb">
              <img src={attachment.preview} alt="Screenshot" />
              <button
                type="button"
                className="rm"
                data-tip="Remove screenshot"
                aria-label="Remove screenshot"
                onClick={() => onRemoveAttachment(attachment.path)}
              >
                <XIcon />
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <button
          type="button"
          className="ib"
          data-tip="Quick actions"
          aria-label="Quick actions"
          aria-expanded={quickActionsOpen}
          data-overlay-popup
          onClick={onToggleQuickActions}
        >
          <BoltIcon />
        </button>
        <button type="button" className="ib" data-tip={screenshotTip} aria-label="Attach screenshot" onClick={onAttachScreenshot}>
          <CameraIcon />
        </button>
        {input}
        <button type="submit" className="ib send" data-tip="Send ↵" aria-label="Send question">
          <UpIcon />
        </button>
        {quickActionsOpen && quickActions}
      </form>
    </div>
  </section>
);

export default ConversationPanel;
