-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headCommitId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Branch_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Branch_headCommitId_fkey" FOREIGN KEY ("headCommitId") REFERENCES "Commit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "parentCommitId" TEXT,
    "parentCommitId2" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Commit_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Commit_parentCommitId_fkey" FOREIGN KEY ("parentCommitId") REFERENCES "Commit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Commit_parentCommitId2_fkey" FOREIGN KEY ("parentCommitId2") REFERENCES "Commit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Unit_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnitSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commitId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitSnapshot_commitId_fkey" FOREIGN KEY ("commitId") REFERENCES "Commit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UnitSnapshot_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnitState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitState_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UnitState_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_worldId_name_key" ON "Branch"("worldId", "name");

-- CreateIndex
CREATE INDEX "UnitSnapshot_commitId_idx" ON "UnitSnapshot"("commitId");

-- CreateIndex
CREATE INDEX "UnitSnapshot_unitId_idx" ON "UnitSnapshot"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitState_branchId_unitId_key" ON "UnitState"("branchId", "unitId");
