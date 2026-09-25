import "server-only";

import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";

import { aiEmbed, type OpenRouterUsage } from "@/lib/ai/openrouter";
import { db } from "@/lib/db";
import {
  agreementDocumentChunks,
  agreementDocuments,
  fileAttachments,
  files,
} from "@/lib/db/schema";

const FULL_CONTEXT_TOKEN_LIMIT = 60_000;
const RRF_K = 60;
const RESULT_LIMIT = 14;

export type AgreementEvidence = {
  id: string;
  documentId: string;
  fileId: string;
  attachmentId: string;
  documentName: string;
  label: "mou" | "license";
  sourceOrder: number;
  chunkIndex: number;
  section: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
};

export type AgreementRetrieval = {
  mode: "full" | "hybrid";
  evidence: AgreementEvidence[];
  embeddingUsage: OpenRouterUsage | null;
  embeddingModel: string | null;
};

export function reciprocalRankFusion(rankings: string[][], k = RRF_K) {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

function selectFields() {
  return {
    id: agreementDocumentChunks.id,
    documentId: agreementDocumentChunks.documentId,
    fileId: agreementDocuments.fileId,
    attachmentId: agreementDocuments.attachmentId,
    documentName: files.originalName,
    label: agreementDocuments.label,
    sourceOrder: agreementDocumentChunks.sourceOrder,
    chunkIndex: agreementDocumentChunks.chunkIndex,
    section: agreementDocumentChunks.section,
    pageStart: agreementDocumentChunks.pageStart,
    pageEnd: agreementDocumentChunks.pageEnd,
    content: agreementDocumentChunks.content,
  };
}

function evidenceBase() {
  return db
    .select(selectFields())
    .from(agreementDocumentChunks)
    .innerJoin(
      agreementDocuments,
      eq(agreementDocuments.id, agreementDocumentChunks.documentId)
    )
    .innerJoin(files, eq(files.id, agreementDocuments.fileId))
    .innerJoin(
      fileAttachments,
      eq(fileAttachments.id, agreementDocuments.attachmentId)
    );
}

function sourceOrder(a: AgreementEvidence, b: AgreementEvidence) {
  return a.sourceOrder - b.sourceOrder || a.chunkIndex - b.chunkIndex;
}

export async function retrieveAgreementEvidence(input: {
  projectId: string;
  userId: string;
  documentIds: string[];
  question: string;
}): Promise<AgreementRetrieval> {
  const documents = await db
    .select({
      id: agreementDocuments.id,
      estimatedTokens: agreementDocuments.estimatedTokens,
    })
    .from(agreementDocuments)
    .where(
      and(
        eq(agreementDocuments.projectId, input.projectId),
        eq(agreementDocuments.status, "ready"),
        inArray(agreementDocuments.id, input.documentIds)
      )
    );
  if (documents.length !== input.documentIds.length) {
    throw new Error("One or more selected agreements are not ready.");
  }

  const estimatedTokens = documents.reduce(
    (sum, document) => sum + document.estimatedTokens,
    0
  );
  if (estimatedTokens <= FULL_CONTEXT_TOKEN_LIMIT) {
    const evidence = await evidenceBase()
      .where(
        and(
          eq(agreementDocumentChunks.projectId, input.projectId),
          inArray(agreementDocumentChunks.documentId, input.documentIds)
        )
      )
      .orderBy(
        asc(agreementDocumentChunks.sourceOrder),
        asc(agreementDocumentChunks.chunkIndex)
      );
    return {
      mode: "full",
      evidence,
      embeddingUsage: null,
      embeddingModel: null,
    };
  }

  const [embedding] = await aiEmbed([input.question], {
    strictPrivacy: true,
    metering: {
      scope: "member",
      taskKey: "wiki_embedding",
      feature: "agreement_qa",
      operation: "embed_question",
      userId: input.userId,
      actorUserId: input.userId,
      projectId: input.projectId,
      metadata: { selectedDocumentCount: input.documentIds.length },
    },
  }).then((result) => [result]);

  const lexicalRank = sql<number>`ts_rank_cd(
    to_tsvector('simple', ${agreementDocumentChunks.searchText}),
    plainto_tsquery('simple', ${input.question})
  )`;
  const similarity = sql<number>`1 - (${cosineDistance(
    agreementDocumentChunks.embedding,
    embedding.embeddings[0]
  )})`;

  const [lexical, semantic] = await Promise.all([
    db
      .select({ id: agreementDocumentChunks.id })
      .from(agreementDocumentChunks)
      .where(
        and(
          eq(agreementDocumentChunks.projectId, input.projectId),
          inArray(agreementDocumentChunks.documentId, input.documentIds),
          sql`${lexicalRank} > 0`
        )
      )
      .orderBy(desc(lexicalRank))
      .limit(RESULT_LIMIT),
    db
      .select({ id: agreementDocumentChunks.id, similarity })
      .from(agreementDocumentChunks)
      .where(
        and(
          eq(agreementDocumentChunks.projectId, input.projectId),
          inArray(agreementDocumentChunks.documentId, input.documentIds),
          isNotNull(agreementDocumentChunks.embedding),
          sql`${similarity} >= 0.45`
        )
      )
      .orderBy(desc(similarity))
      .limit(RESULT_LIMIT),
  ]);
  const fused = reciprocalRankFusion([
    lexical.map((row) => row.id),
    semantic.map((row) => row.id),
  ]).slice(0, RESULT_LIMIT);

  const seeds = fused.length
    ? await db
        .select({
          id: agreementDocumentChunks.id,
          documentId: agreementDocumentChunks.documentId,
          chunkIndex: agreementDocumentChunks.chunkIndex,
        })
        .from(agreementDocumentChunks)
        .where(inArray(agreementDocumentChunks.id, fused))
    : [];
  const neighborClauses = seeds.map(
    (seed) =>
      sql`(${agreementDocumentChunks.documentId} = ${seed.documentId} and ${agreementDocumentChunks.chunkIndex} between ${Math.max(0, seed.chunkIndex - 1)} and ${seed.chunkIndex + 1})`
  );
  const definitions = await db
    .select({ id: agreementDocumentChunks.id })
    .from(agreementDocumentChunks)
    .where(
      and(
        eq(agreementDocumentChunks.projectId, input.projectId),
        inArray(agreementDocumentChunks.documentId, input.documentIds),
        ilike(agreementDocumentChunks.section, "%definition%")
      )
    )
    .orderBy(
      asc(agreementDocumentChunks.sourceOrder),
      asc(agreementDocumentChunks.chunkIndex)
    )
    .limit(3);

  const ids = new Set([...fused, ...definitions.map((row) => row.id)]);
  if (neighborClauses.length > 0) {
    const neighbors = await db
      .select({ id: agreementDocumentChunks.id })
      .from(agreementDocumentChunks)
      .where(
        and(
          eq(agreementDocumentChunks.projectId, input.projectId),
          inArray(agreementDocumentChunks.documentId, input.documentIds),
          sql.join(neighborClauses, sql` or `)
        )
      );
    neighbors.forEach((row) => ids.add(row.id));
  }

  const evidence = ids.size
    ? await evidenceBase().where(
        and(
          eq(agreementDocumentChunks.projectId, input.projectId),
          inArray(agreementDocumentChunks.id, [...ids])
        )
      )
    : [];
  return {
    mode: "hybrid",
    evidence: evidence.sort(sourceOrder),
    embeddingUsage: embedding.usage,
    embeddingModel: embedding.model,
  };
}

