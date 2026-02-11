import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { finalizeCharacter } from "@/domain/rules";
import { toPrintablePdfModel } from "@/services/export";

export async function POST(request: Request) {
  try {
    const draftOrSheet = await request.json();
    const sheet = draftOrSheet.derivedStats ? draftOrSheet : finalizeCharacter(draftOrSheet);
    const printable = toPrintablePdfModel(sheet);

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 800;
    page.drawText(printable.title, {
      x: 40,
      y,
      font: bold,
      size: 18,
      color: rgb(0.1, 0.1, 0.1),
    });

    y -= 28;
    for (const section of printable.sections) {
      page.drawText(`${section.label}:`, {
        x: 40,
        y,
        font: bold,
        size: 11,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 14;

      const chunks = section.value.match(/.{1,95}/g) ?? [section.value];
      for (const chunk of chunks) {
        page.drawText(chunk, {
          x: 48,
          y,
          font,
          size: 10,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= 12;
      }

      y -= 8;
      if (y < 70) {
        y = 800;
        page = pdfDoc.addPage([595, 842]);
      }
    }

    const bytes = await pdfDoc.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=investigador-coc7.pdf",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
