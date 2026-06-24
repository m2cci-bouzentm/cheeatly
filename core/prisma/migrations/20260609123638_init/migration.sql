-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meetingId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "Chunk_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Context" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "attachableType" TEXT NOT NULL,
    "attachableId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "File_attachableType_attachableId_idx" ON "File"("attachableType", "attachableId");
