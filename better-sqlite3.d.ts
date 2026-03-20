declare module "better-sqlite3" {
  interface Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface Database {
    pragma(source: string): unknown;
    exec(source: string): Database;
    close(): void;
    prepare(source: string): Statement;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean }): Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}
