import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClassNav } from "@/app/teacher/class-nav";
import { isUuid, orNotFound, teacherPage } from "@/lib/teacher/page-gate";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Seat cards · LenguaLearn" };

// Spec: a printable page of cut-out cards, 8 per sheet: join URL, seat code, and a blank
// line for the student to write their handle. No names.
export default function CardsPage({ params }: PageProps<"/teacher/class/[id]/cards">) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/teacher/class/[id]/cards">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await teacherPage(`/teacher/class/${id}/cards`);
  const [c, seats] = await orNotFound(() => Promise.all([scope.getClass(id), scope.listSeats(id)]));
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const joinUrl = `${proto}://${host}/join`;
  const withCodes = seats.filter((s) => s.code && s.codeKind === "join");
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10 print:p-0">
      <ClassNav classId={id} className={c.name} current="cards" />
      <div className="flex items-center justify-between gap-4 print:hidden">
        <p className="text-zinc-600 dark:text-zinc-400">
          One card per unused seat, 8 to a page. Cut along the lines.
        </p>
        <PrintButton label="Print cards" />
      </div>
      {withCodes.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">Every seat has been joined.</p>
      ) : (
        <div className="grid grid-cols-2 gap-0">
          {withCodes.map((s, i) => (
            <div
              key={s.id}
              className={`flex h-[24vh] flex-col justify-between border border-dashed border-zinc-400 p-4 text-black print:h-[24.5vh] ${i % 8 === 7 ? "break-after-page" : ""}`}
            >
              <div className="text-sm">
                {c.name} · Seat {s.seatNumber}
              </div>
              <div>
                <div className="text-sm">Go to {joinUrl} and enter</div>
                <div className="font-mono text-3xl font-semibold tracking-wider">{s.code}</div>
              </div>
              <div className="text-sm">
                My handle: <span className="inline-block w-48 border-b border-black" />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
