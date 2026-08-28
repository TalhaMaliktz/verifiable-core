export interface IChatProvider {
    readonly providerName: string;
    generateAnswer(systemPrompt: string, userPrompt: string): Promise<string>;
}