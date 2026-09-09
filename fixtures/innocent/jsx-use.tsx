import { Badge } from "./parts";

export function Demo({ note }: { note: string }) {
  // An apostrophe in JSX text must not open a phantom string, and the
  // slash in closing tags must not read as a regex opener.
  return (
    <div>
      <p>You're at {note.length} chars don't worry</p>
      <Badge label="ok" />
      <section><Badge label="second" /></section>
    </div>
  );
}
