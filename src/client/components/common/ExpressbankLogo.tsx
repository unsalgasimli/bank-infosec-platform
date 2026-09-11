import React from "react";

export const EXPRESSBANK_EMBLEM_PATH =
  "M27.801 16.8737V21.1563H13.6897C12.4432 21.1512 11.2477 20.6611 10.3563 19.7897C9.465 18.9184 8.94787 17.7343 8.91449 16.4882V13.469C8.91449 12.8429 9.03815 12.223 9.27839 11.6448C9.51862 11.0667 9.8707 10.5417 10.3144 10.0999C10.7581 9.65824 11.2847 9.30853 11.8639 9.0709C12.4431 8.83326 13.0636 8.71238 13.6897 8.7152H27.8224C28.3903 8.7152 28.935 8.94081 29.3366 9.34238C29.7381 9.74396 29.9637 10.2886 29.9637 10.8565C29.9637 11.4244 29.7381 11.9691 29.3366 12.3707C28.935 12.7723 28.3903 12.9979 27.8224 12.9979H12.5333V16.8737H27.801ZM13.6897 0H28.5505C31.4004 0.170873 34.0823 1.40565 36.0651 3.45985C38.0479 5.51404 39.1871 8.23789 39.2571 11.0921C39.2086 13.2929 38.5316 15.434 37.3061 17.2627C36.0807 19.0915 34.3577 20.5316 32.3406 21.4133L27.801 16.8737C28.5896 16.8937 29.3743 16.7556 30.1087 16.4675C30.8432 16.1795 31.5125 15.7474 32.0773 15.1965C32.6421 14.6457 33.0908 13.9874 33.3972 13.2604C33.7035 12.5335 33.8612 11.7525 33.861 10.9636C33.8328 9.37894 33.1806 7.86939 32.0459 6.76281C30.9113 5.65623 29.3859 5.042 27.801 5.05353H13.6897C11.4577 5.05353 9.31725 5.94015 7.73905 7.51835C6.16086 9.09655 5.27424 11.237 5.27424 13.469V16.4882C5.27424 18.7201 6.16086 20.8606 7.73905 22.4388C9.31725 24.017 11.4577 24.9036 13.6897 24.9036H27.8224V29.9786H13.6897C10.1155 29.9729 6.68967 28.5491 4.16437 26.0198C1.63906 23.4905 0.220699 20.0624 0.220703 16.4882L0.220703 13.469C0.226366 9.8985 1.64723 6.47591 4.17192 3.95122C6.69661 1.42653 10.1192 0.0056629 13.6897 0V0Z";

interface ExpressbankEmblemProps {
  size?: number | string;
  className?: string;
  fill?: string;
  glow?: boolean;
}

export const ExpressbankEmblem: React.FC<ExpressbankEmblemProps> = ({
  size = 20,
  className = "",
  fill = "#FAA61A",
  glow = false,
}) => {
  const gradientId = React.useId();

  return (
    <svg
      width={size}
      height={typeof size === "number" ? Math.round(size * 0.75) : size}
      viewBox="0 0 40 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        filter: glow ? "drop-shadow(0 0 6px rgba(250, 166, 26, 0.55))" : undefined,
      }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="40" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFC247" />
          <stop offset="50%" stopColor="#FAA61A" />
          <stop offset="100%" stopColor="#E08800" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={EXPRESSBANK_EMBLEM_PATH}
        fill={fill === "#FAA61A" ? `url(#${gradientId})` : fill}
      />
    </svg>
  );
};
