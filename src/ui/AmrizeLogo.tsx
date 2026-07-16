// Amrize brand marks. Geometry traced from Amrize's official logo SVG
// (amrize.com /content/dam/newco/global/logo-amrize.svg). Paths use
// `currentColor` so the same asset renders navy on light surfaces and white
// on the blue brand bar — set the color via CSS.
//
// This is an independent portfolio/demo styled in the Amrize brand; it is not
// an official Amrize product (see the footer note).

/** The stylised "A" summit mark on its own — used for the favicon and accents. */
export function AmrizeMark({ className, title = 'Amrize' }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 5.679 29.656 22.392" role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        d="M29.6559 28.0709H19.6782L18.3064 23.8491L26.4222 18.1191L29.6559 28.0709ZM7.27544 5.67938L0 28.0709H9.9776L14.8279 13.1432L16.4446 18.1191H26.4222L22.3803 5.67938H7.27544Z"
      />
    </svg>
  );
}

/** Full Amrize wordmark ("A" summit mark + lettering). */
export function AmrizeLogo({ className, title = 'Amrize' }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 126 36" role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        d="M40.9092 13.1431H46.175L52.4633 28.0708H48.1534L47.0916 25.4268H40.0037L38.9421 28.0708H34.6322L40.9092 13.1431ZM45.6039 21.741L43.5422 16.6289L41.4806 21.741H45.6039ZM59.6812 13.1431L62.7622 21.2685L65.8437 13.1431H71.6308V28.0708H67.7998V18.2025L63.4545 28.0708H62.0677L57.7228 18.2025V28.0708H53.8919V13.1431H59.6812ZM83.5758 13.1431C87.1053 13.1431 88.8022 15.486 88.8022 18.2025C88.8022 20.3476 87.7095 22.2839 85.6899 23.1477L88.6043 28.0708H83.993L81.38 23.585H78.5468V28.0708L74.6042 28.0708V13.1431H83.5758ZM82.9293 20.0025C84.0747 20.0025 84.8128 19.3784 84.8128 18.3476C84.8128 17.3168 84.0524 16.8267 83.0855 16.8267H78.5468V20.0025H82.9293ZM91.101 13.1431H95.0573V28.0708H91.101V13.1431ZM97.446 24.429L105.67 16.8289H97.51V13.1431H111.385V16.7234L103.16 24.385H111.499V28.0708H97.446V24.4268V24.429ZM113.831 13.1431H126V16.8289H117.787V18.5564H125.387V22.2312H117.787V24.385H126V28.0708H113.831V13.1431Z"
      />
      <path
        fill="currentColor"
        d="M29.6559 28.0709H19.6782L18.3064 23.8491L26.4222 18.1191L29.6559 28.0709ZM7.27544 5.67938L0 28.0709H9.9776L14.8279 13.1432L16.4446 18.1191H26.4222L22.3803 5.67938H7.27544Z"
      />
    </svg>
  );
}
