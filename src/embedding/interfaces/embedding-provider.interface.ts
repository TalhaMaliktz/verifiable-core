
export interface EmbeddingResult {
    embedding: number[];
    dimensions: number;
    model: string;
}

export interface IEmbeddingProvider {
    readonly modelName: string;
    readonly dimensions: number;

    embedText(text: string): Promise<EmbeddingResult>;
    embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}