import dotenv from 'dotenv';
import fs from 'fs';
import OpenAI from "openai";
import { ChatCompletionAssistantMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam, ChatModel, ResponseFormatJSONSchema } from "openai/resources";
import { Turn } from "../../types";
dotenv.config();



export async function llmIsParticipant(openAi: OpenAI, conversation: Turn[], question: string, schema: ResponseFormatJSONSchema, whichParticipant: 'A' | 'B', model: ChatModel = 'gpt-4o-mini', retryCount: number = 0) {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: fs.readFileSync('src/methods/llm_is_participant/llm_is_participant.hbs', 'utf8')
        } satisfies ChatCompletionSystemMessageParam,
        ...conversation.map(turn => ({
            role: turn.participant === whichParticipant ? 'assistant' : 'user',
            content: turn.transcript,
            name: turn.participant === whichParticipant ? 'Participant_' + whichParticipant : 'Participant_' + (whichParticipant === 'A' ? 'B' : 'A')
        } satisfies ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam)),
        {
            role: 'user',
            content: question,
        } satisfies ChatCompletionUserMessageParam
    ];

    const completion = await openAi.chat.completions.create({
        model,
        logprobs: true,
        top_logprobs: 10,
        stream: false,
        seed: 12,
        temperature: 0,
        messages,
        response_format: schema
    });

    try {
        return { content: JSON.parse(completion.choices[0].message.content!), logprobs: completion.choices[0].logprobs!.content };
    } catch (error) {
        if (retryCount < 1) {
            return llmIsParticipant(openAi, conversation, question, schema, whichParticipant, model, retryCount + 1);
        }
        throw error;
    }
}
