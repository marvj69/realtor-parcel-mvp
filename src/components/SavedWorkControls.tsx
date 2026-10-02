"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { PARCEL_TAGS, tagColor, tagLabel } from "@/lib/parcel-presentation";
import { savedWork } from "@/lib/saved-work-client";
import type { SavedParcelNote } from "@/types/parcel";

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

/** A destructive action that asks for an inline confirmation before running. */
export function ConfirmAction({
  label,
  confirmLabel,
  prompt,
  onConfirm,
  disabled
}: {
  label: string;
  confirmLabel: string;
  prompt: string;
  onConfirm: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!asking) {
    return (
      <button
        type="button"
        className="text-button danger-text"
        disabled={disabled}
        onClick={() => {
          setError("");
          setAsking(true);
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <div className="confirm-row" role="group" aria-label={prompt}>
      <span>{prompt}</span>
      <button
        type="button"
        className="danger-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onConfirm();
            setAsking(false);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : confirmLabel}
      </button>
      <button type="button" className="text-button" disabled={busy} onClick={() => setAsking(false)}>
        Cancel
      </button>
      {error ? (
        <p role="alert" className="message error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TagDot({ tag }: { tag: string | null | undefined }) {
  return <i className="tag-dot" style={{ background: tagColor(tag) }} aria-hidden="true" />;
}

/** Changes a saved parcel's workflow tag immediately. */
export function TagSelect({
  savedParcelId,
  tag,
  onChanged,
  label = "Workflow tag"
}: {
  savedParcelId: string;
  tag: string | null;
  onChanged: () => void;
  label?: string;
}) {
  const [value, setValue] = useState(tag ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="tag-select">
      <TagDot tag={value || null} />
      <select
        aria-label={label}
        value={value}
        disabled={busy}
        onChange={async (event) => {
          const next = event.target.value;
          const previous = value;
          setValue(next);
          setBusy(true);
          setError("");
          try {
            await savedWork.setTag(savedParcelId, next || null);
            onChanged();
          } catch (err) {
            setValue(previous);
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="">No tag</option>
        {PARCEL_TAGS.map((option) => (
          <option key={option} value={option}>
            {tagLabel(option)}
          </option>
        ))}
      </select>
      {error ? (
        <span role="alert" className="inline-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function noteDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** A saved note with inline edit and delete. */
export function EditableNote({ note, onChanged }: { note: SavedParcelNote; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (editing) {
    return (
      <form
        className="note-item editing"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await savedWork.editNote(note.id, text);
            setEditing(false);
            onChanged();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="sr-only" htmlFor={`note-${note.id}`}>
          Edit note
        </label>
        <textarea
          id={`note-${note.id}`}
          value={text}
          maxLength={2000}
          disabled={busy}
          autoFocus
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setText(note.note);
              setEditing(false);
            }
          }}
        />
        <div className="button-row">
          <button className="primary-button compact-button" disabled={busy || !text.trim()}>
            {busy ? "Saving…" : "Save note"}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setText(note.note);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
        {error ? (
          <p role="alert" className="message error">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <div className="note-item">
      <p>{note.note}</p>
      <div className="note-meta">
        <span>{noteDate(note.createdAt)}</span>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setText(note.note);
            setError("");
            setEditing(true);
          }}
        >
          <Icon name="edit" size={13} /> Edit
        </button>
        <ConfirmAction
          label="Delete"
          confirmLabel="Delete note"
          prompt="Delete this note?"
          onConfirm={async () => {
            await savedWork.deleteNote(note.id);
            onChanged();
          }}
        />
      </div>
    </div>
  );
}
