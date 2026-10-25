import { prisma } from "@/lib/prisma";
import Notice from "@/components/admin/Notice";
import PhotoManager from "@/components/admin/PhotoManager";

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const q = await searchParams;
  const photos = await prisma.photo.findMany({ where: { roomTypeId: null }, orderBy: { sortOrder: "asc" } });
  return (
    <>
      <Notice saved={q.saved} error={q.error} />
      <p className="muted small">Foto gedung dan fasilitas bersama. Tampil di bagian atas situs. Foto kamar diatur di halaman tiap kamar.</p>
      <PhotoManager photos={photos} roomTypeId={null} back="/admin/data/foto" />
    </>
  );
}
