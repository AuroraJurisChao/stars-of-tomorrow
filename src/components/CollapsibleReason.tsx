import { useState } from "react";
import { unicodeLength } from "@contracts/constants";

export function CollapsibleReason({ text, attribution, quote = false, className = "" }: { text: string; attribution?: string; quote?: boolean; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = unicodeLength(text) > 320;
  return <div className={`collapsible-reason ${className}`}>
    <blockquote className={long && !expanded ? "is-collapsed" : ""}>{quote ? "“" : null}{text}{quote ? "”" : null}{attribution && <span>—— {attribution}</span>}</blockquote>
    {long && <button className="reason-expand" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? "收起" : "展开全文"}</button>}
  </div>;
}
