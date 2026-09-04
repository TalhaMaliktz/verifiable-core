export interface CandidateChunk {
    id: string;
    documentId: string;
    documentTitle: string;
    chunkIndex: number;
    text: string;
}

export interface FusedChunk extends CandidateChunk {
    rrfScore: number;
}