export interface IChatProvider {
    readonly providerName: string;
    generateAnswer(prompt: string): Promise<string>;
}