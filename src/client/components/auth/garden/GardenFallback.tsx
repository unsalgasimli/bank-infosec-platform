import React from "react";

/** Local, code-native illustration: visible before WebGL and if it fails. */
export function GardenFallback({
  bloomed = false,
  finished = false,
}: {
  bloomed?: boolean;
  finished?: boolean;
}) {
  return (
    <svg className="garden-fallback" viewBox="0 0 1000 800" aria-hidden="true">
      <defs>
        <linearGradient id="garden-water" x2="0.8" y2="1">
          <stop stopColor="#91b6ab" />
          <stop offset="1" stopColor="#c5d7c9" />
        </linearGradient>
        <linearGradient id="garden-clay" x2="1" y2="0">
          <stop stopColor="#ad6249" />
          <stop offset="0.5" stopColor="#d49676" />
          <stop offset="1" stopColor="#e6b698" />
        </linearGradient>
      </defs>
      <ellipse cx="505" cy="616" rx="370" ry="118" fill="url(#garden-water)" />
      <g fill="none" stroke="#f3eee0" opacity=".4">
        <ellipse cx="480" cy="615" rx="328" ry="95" />
        <ellipse cx="550" cy="635" rx="268" ry="64" />
      </g>
      <ellipse cx="504" cy="588" rx="242" ry="87" fill="#a87658" />
      <path
        d="M262 556v32c0 48 108 87 242 87s242-39 242-87v-32"
        fill="#d7b59a"
      />
      <ellipse cx="504" cy="556" rx="242" ry="87" fill="#eddbc1" />
      <path
        d="M374 532V288a139 139 0 0 1 278 0v244h-62V288a77 77 0 0 0-154 0v244Z"
        fill="url(#garden-clay)"
      />
      <g stroke="#837953" strokeWidth="7">
        <path d="M355 570V391M541 563V365M670 590V456" />
      </g>
      {[
        { x: 355, y: 375, s: 1 },
        { x: 541, y: 354, s: 1.25 },
        { x: 670, y: 443, s: 0.8 },
      ].map(({ x, y, s }, i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          {[0, 90, 180, 270].map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <path d="M0 0Q-75-23-55-99Q7-95 0 0" fill="#fff8e8" />
              <path d="M0 0-55-99Q-4-62 0 0" fill="#d6c6a5" />
            </g>
          ))}
          <circle r="10" fill="#b07a44" />
        </g>
      ))}
      <g fill="#799483">
        <ellipse
          cx="325"
          cy="520"
          rx="20"
          ry="38"
          transform="rotate(-30 325 520)"
        />
        <ellipse
          cx="696"
          cy="547"
          rx="20"
          ry="35"
          transform="rotate(25 696 547)"
        />
      </g>
      <g fill="#638169">
        {Array.from({ length: 16 }, (_, i) => (
          <ellipse
            key={i}
            cx={290 + (i % 4) * 135 + Math.sin(i) * 20}
            cy={535 + Math.floor(i / 4) * 12}
            rx="9"
            ry="29"
            transform={`rotate(${((i % 3) - 1) * 35} ${290 + (i % 4) * 135 + Math.sin(i) * 20} ${535 + Math.floor(i / 4) * 12})`}
          />
        ))}
      </g>
      {bloomed && (
        <g fill="#e4a083">
          {[320, 405, 615, 700].map((x, i) => (
            <g key={x} transform={`translate(${x} ${550 + (i % 2) * 25})`}>
              <path d="M0 0v-35" stroke="#638169" strokeWidth="3" />
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse
                  key={a}
                  cx="0"
                  cy="-44"
                  rx="6"
                  ry="12"
                  transform={`rotate(${a} 0 -35)`}
                />
              ))}
            </g>
          ))}
        </g>
      )}
      {finished && (
        <g fill="#eebaa2" transform="translate(510 490)">
          {[-55, -28, 0, 28, 55].map((a) => (
            <ellipse
              key={a}
              cx="0"
              cy="-28"
              rx="17"
              ry="45"
              transform={`rotate(${a})`}
            />
          ))}
          <circle r="12" fill="#cfa55c" />
        </g>
      )}
    </svg>
  );
}
