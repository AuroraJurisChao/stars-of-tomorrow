export function Laurel({ className = "" }: { className?: string }) {
  const leaves = Array.from({ length: 9 }, (_, index) => index);
  return (
    <svg className={className} viewBox="0 0 320 320" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M142 280C74 254 39 197 46 124C49 94 59 70 76 47" />
        <path d="M178 280C246 254 281 197 274 124C271 94 261 70 244 47" />
      </g>
      <g fill="currentColor">
        {leaves.map((index) => {
          const y = 246 - index * 22;
          const x = 78 - Math.sin(index / 8 * Math.PI) * 29;
          return <g key={`l${index}`} transform={`translate(${x} ${y}) rotate(${-38 + index * 3})`}><ellipse cx="-12" cy="-4" rx="17" ry="7" transform="rotate(38)" /><ellipse cx="12" cy="-12" rx="17" ry="7" transform="rotate(-52)" /></g>;
        })}
        {leaves.map((index) => {
          const y = 246 - index * 22;
          const x = 242 + Math.sin(index / 8 * Math.PI) * 29;
          return <g key={`r${index}`} transform={`translate(${x} ${y}) rotate(${38 - index * 3})`}><ellipse cx="12" cy="-4" rx="17" ry="7" transform="rotate(-38)" /><ellipse cx="-12" cy="-12" rx="17" ry="7" transform="rotate(52)" /></g>;
        })}
        <path d="M160 23L166 42L186 42L170 54L176 74L160 62L144 74L150 54L134 42L154 42L160 23Z" />
      </g>
    </svg>
  );
}
