// mailparser ships no usable type declarations for our needs.
declare module 'mailparser' {
  // simpleParser returns a rich object; we treat it loosely.
  export function simpleParser(source: Buffer | string | NodeJS.ReadableStream): Promise<any>;
}
