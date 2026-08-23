import type { SVGProps } from "react";

export function VerticalOverflowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      data-icon="vertical-overflow"
      {...props}
    >
      <circle cx="10" cy="4" r="1.25" />
      <circle cx="10" cy="10" r="1.25" />
      <circle cx="10" cy="16" r="1.25" />
    </svg>
  );
}

export function PinIcon({
  pinned = false,
  ...props
}: SVGProps<SVGSVGElement> & { pinned?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill={pinned ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      aria-hidden="true"
      data-icon="pin"
      {...props}
    >
      <path d="m7.25 3.5 5.5 0-.7 4.15 2.2 2.2v1.4h-8.5v-1.4l2.2-2.2-.7-4.15Z" />
      <path d="M10 11.25v5.25" />
    </svg>
  );
}
