export function downloadPgn(pgn: string, name: string) {
  const url = URL.createObjectURL(new Blob([pgn + '\n'], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.pgn`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
