export type StoredFile = {
  path: string;
  originalName: string;
};

export interface FileStorageProvider {
  upload(
    content: string,
    filename: string,
    folder?: string
  ): Promise<StoredFile>;
  delete(path: string): Promise<boolean>;
  load(path: string): Promise<string>;
}
