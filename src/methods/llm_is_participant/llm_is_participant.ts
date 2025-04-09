import { Static, Type } from '@sinclair/typebox';
import dotenv from 'dotenv';
import fs from 'fs';
import OpenAI from "openai";
import { ChatCompletionAssistantMessageParam, ChatCompletionSystemMessageParam, ChatCompletionTokenLogprob, ChatCompletionUserMessageParam, ChatModel } from "openai/resources";
import { ColumnMap, ColumnMapTypeEnum, Dyad, Turn } from "../../types";
import { MethodResultType } from '../types';
dotenv.config();

const genderSchema = Type.Object({
    gender: Type.Union([Type.Literal('male'), Type.Literal('female')]),
});

export async function llmIsParticipant(openAi: OpenAI, conversation: Turn[], question: string, whichParticipant: 'A' | 'B', model: ChatModel = 'gpt-4o-mini', retryCount: number = 0) {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: fs.readFileSync('src/methods/llm_is_participant/llm_is_participant.hbs', 'utf8')
        } satisfies ChatCompletionSystemMessageParam,
        ...conversation.map(turn => ({
            role: turn.participant === whichParticipant ? 'assistant' : 'user',
            content: turn.transcript,
            // name: turn.participant === whichParticipant ? 'Participant_' + whichParticipant : 'Participant_' + (whichParticipant === 'A' ? 'B' : 'A')
        } satisfies ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam)),
        {
            role: 'user',
            content: question,
            // name: turn.participant === whichParticipant ? 'Participant_' + whichParticipant : 'Participant_' + (whichParticipant === 'A' ? 'B' : 'A')
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
        response_format: { type: 'json_schema', json_schema: { strict: true, name: 'gender', schema: { ...genderSchema, additionalProperties: false } } }
    });

    try {
        return { content: JSON.parse(completion.choices[0].message.content!) as Static<typeof genderSchema>, logprobs: completion.choices[0].logprobs!.content };
    } catch (error) {
        if (retryCount < 1) {
            return llmIsParticipant(openAi, conversation, question, whichParticipant, model, retryCount + 1);
        }
        throw error;
    }
}

export function parseLlmIsParticipantResult(columnMap: ColumnMap, dyad: Dyad, participant: 'A' | 'B', result: { content: Static<typeof genderSchema>, logprobs: ChatCompletionTokenLogprob[] | null }, ordinality?: number): MethodResultType {
    const logprob = result.logprobs?.find(logprob => logprob.token === result.content.gender);
    const maleFemaleLogprobs = logprob?.top_logprobs.filter(logprob => logprob.token === 'male' || logprob.token === 'female').map(logprob => ({
        [logprob.token]: logprob.logprob
    })).reduce((acc, logprob) => ({
        ...acc,
        ...logprob
    }), {} as { [key: string]: number });

    const percentages = maleFemaleLogprobs ? logProbsToPercentage(maleFemaleLogprobs) : logprob ? logProbsToPercentage({ [result.content.gender]: logprob.logprob }) : undefined;
    const actualValue = dyad.turns.find(turn => turn.participant === participant && turn.toPredict !== '')?.toPredict;

    switch (columnMap.type) {
        case ColumnMapTypeEnum.BOTH_PARTICIPANTS_IN_ONE_ROW:
            return {
                [columnMap.dyadIdColumnName]: dyad.dyadId,
                participant: participant,
                [participant === 'A' ? columnMap.participantAColumns.toPredictColumnName : columnMap.participantBColumns.toPredictColumnName]: actualValue,

                ...(ordinality ? { [participant === 'A' ? columnMap.participantAColumns.ordinalityColumnName : columnMap.participantBColumns.ordinalityColumnName]: ordinality } : {}),

                predictedValue: result.content.gender,
                malePercentage: percentages?.male,
                femalePercentage: percentages?.female,
            };
        case ColumnMapTypeEnum.EACH_PARTICIPANT_IN_SEPERATE_ROWS:
            return {
                [columnMap.dyadIdColumnName]: dyad.dyadId,
                [columnMap.participantDiscriminatorColumnName]: participant === 'A' ? columnMap.participantAColumns.discriminatorValue : columnMap.participantBColumns.discriminatorValue,
                [participant === 'A' ? columnMap.participantAColumns.toPredictColumnName : columnMap.participantBColumns.toPredictColumnName]: actualValue,

                ...(ordinality ? { [participant === 'A' ? columnMap.participantAColumns.ordinalityColumnName : columnMap.participantBColumns.ordinalityColumnName]: ordinality } : {}),

                predictedValue: result.content.gender,
                malePercentage: percentages?.male,
                femalePercentage: percentages?.female,
            };
    }
}

function logProbsToPercentage(logprobs: { [key: string]: number }): { [key: string]: number } {
    // Convert log probabilities to probabilities
    const probabilities: { [key: string]: number } = {};
    for (const token in logprobs) {
        probabilities[token] = Math.exp(logprobs[token]);
    }

    // Compute total probability sum
    const totalProb = Object.values(probabilities).reduce((sum, p) => sum + p, 0);

    // Normalize to sum up to 100%
    const normalizedPercentages: { [key: string]: number } = {};
    for (const token in probabilities) {
        normalizedPercentages[token] = (probabilities[token] / totalProb) * 100;
    }

    return normalizedPercentages;
}