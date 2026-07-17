import { Inbox } from "lucide-react";

import { TableCell, TableRow } from "@/components/ui/table";

export function EmptyTableRow({ colSpan, message = "Nenhum dado encontrado para os filtros selecionados." }: { colSpan: number; message?: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-32 text-center text-muted-foreground">
        <Inbox className="mx-auto mb-2 h-5 w-5 opacity-60" />
        <span className="text-sm">{message}</span>
      </TableCell>
    </TableRow>
  );
}
