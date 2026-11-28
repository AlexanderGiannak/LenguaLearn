import { licenseUrl } from "@/lib/content/licenses";
import { link, muted } from "./styles";

/**
 * The credit an openly licensed picture needs (who made it, the license, where it is from),
 * shown wherever the picture is. Generated pictures say so.
 */
export function PictureCredit({
  attribution,
  license,
  source,
  className = "",
}: {
  attribution: string;
  license: string;
  source: string;
  className?: string;
}) {
  const deed = licenseUrl(license);
  const from = /^https:\/\//.test(source) ? source : null;
  return (
    <p className={`text-xs ${muted} ${className}`}>
      {from ? (
        <a href={from} className={link} rel="noopener noreferrer" target="_blank">
          {attribution}
        </a>
      ) : (
        attribution
      )}
      {", "}
      {deed ? (
        <a href={deed} className={link} rel="noopener noreferrer license" target="_blank">
          {license}
        </a>
      ) : (
        license
      )}
    </p>
  );
}
