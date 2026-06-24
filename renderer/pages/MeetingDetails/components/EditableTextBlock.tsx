import React, { useState, useRef, useEffect, useCallback } from 'react';

interface EditableTextBlockProps {
  initialValue: string;
  onSave: (value: string) => void;
  tagName?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  onEnter?: () => void;
  autoFocus?: boolean;
}

const EditableTextBlock: React.FC<EditableTextBlockProps> = ({
  initialValue,
  onSave,
  tagName = 'div',
  className = '',
  placeholder = 'Type here...',
  multiline = true,
  onEnter,
  autoFocus = false,
}) => {
  const [isEditing, setIsEditing] = useState(autoFocus);
  const [localValue, setLocalValue] = useState(initialValue);
  const contentRef = useRef<HTMLElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isEditing) return;
    setLocalValue(initialValue);
    const shouldSyncContent =
      contentRef.current && contentRef.current.innerText !== initialValue;
    if (shouldSyncContent) contentRef.current!.innerText = initialValue;
  }, [initialValue, isEditing]);

  const handleSave = useCallback(
    (newValue: string) => {
      const trimmed = newValue.trim();
      if (trimmed !== initialValue) {
        onSave(trimmed);
      }
    },
    [initialValue, onSave]
  );

  const handleChange = useCallback(() => {
    if (!contentRef.current) return;
    const newValue = contentRef.current.innerText;
    setLocalValue(newValue);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleSave(newValue);
    }, 600);
  }, [handleSave]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (contentRef.current) {
      handleSave(contentRef.current.innerText);
    }
  }, [handleSave]);

  const lastEnterTime = useRef<number>(0);

  const handleEscapeKey = (e: React.KeyboardEvent) => {
    e.preventDefault();
    setIsEditing(false);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (contentRef.current) contentRef.current.innerText = initialValue;
    setLocalValue(initialValue);
  };

  const handleEnterKey = (e: React.KeyboardEvent) => {
    if (!multiline) {
      e.preventDefault();
      contentRef.current?.blur();
      return;
    }
    if (!onEnter) return;

    const now = Date.now();
    const isDoubleEnter = now - lastEnterTime.current < 500;
    if (!isDoubleEnter) {
      // Let the first Enter create a native contentEditable newline; second Enter submits.
      lastEnterTime.current = now;
      return;
    }

    e.preventDefault();
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (contentRef.current) handleSave(contentRef.current.innerText);
    onEnter();
    lastEnterTime.current = 0;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleEscapeKey(e);
      return;
    }
    if (e.key === 'Enter') {
      handleEnterKey(e);
    }
  };

  const handleClick = () => {
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing && contentRef.current) {
      contentRef.current.focus();
    }
  }, [isEditing]);

  const Tag = tagName as any;

  return (
    <Tag
      ref={contentRef}
      contentEditable={isEditing}
      suppressContentEditableWarning={true}
      onClick={handleClick}
      onBlur={handleBlur}
      onInput={handleChange}
      onKeyDown={handleKeyDown}
      className={`
                outline-none min-w-[10px] cursor-text transition-colors duration-200
                bg-transparent
                ${!localValue && placeholder ? 'empty:before:content-[attr(data-placeholder)] empty:before:text-text-tertiary' : ''}
                ${className}
            `}
      data-placeholder={placeholder}
      spellCheck={false}
    >
      {initialValue}
    </Tag>
  );
};

export default EditableTextBlock;
