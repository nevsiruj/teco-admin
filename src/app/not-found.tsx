import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f1] px-6 text-[#10231c]">
      <section className="max-w-md rounded-3xl border border-[#d9e2d6] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2f8d62]">
          Panel interno
        </p>
        <h1 className="mt-3 text-3xl font-bold">Página no encontrada</h1>
        <p className="mt-3 text-sm text-[#62746b]">
          La sección solicitada no existe o cambió de ubicación.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-[#167d57] px-5 py-3 text-sm font-semibold text-white"
        >
          Volver al panel
        </Link>
      </section>
    </main>
  );
}
