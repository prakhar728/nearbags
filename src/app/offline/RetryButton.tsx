"use client";

export function RetryButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
      TRY AGAIN
    </button>
  );
}
