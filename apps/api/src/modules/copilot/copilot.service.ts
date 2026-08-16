import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RequestPriorityHint = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Offline-first heuristic copilot (no external LLM by default).
 * Optional SpaceXAI/xAI later via COPILOT_URL — never auto-posts money moves.
 */
@Injectable()
export class CopilotService {
  constructor(private config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get('COPILOT_ENABLED', 'true') !== 'false';
  }

  /**
   * Classify service request → priority + SLA category hint from keywords (UK/RU).
   */
  classifyRequest(input: {
    title: string;
    description?: string;
    category?: string;
  }): {
    priority: RequestPriorityHint;
    category: string;
    slaHoursHint: number;
    reasons: string[];
  } {
    const text = `${input.title} ${input.description ?? ''}`.toLowerCase();
    const reasons: string[] = [];
    let priority: RequestPriorityHint = 'normal';
    let category = input.category || 'other';
    let slaHoursHint = 48;

    const urgentRe =
      /затоп|прорв|пожеж|газ|аварі|ліфт.?застряг|немає\s*води|немає\s*електр|срочно|urgent|fire|flood/i;
    const highRe =
      /не\s*працює\s*ліфт|каналіз|засор|холод.*під['’]?їзд|зламав|витік|тече/i;
    const electricRe = /електр|розетк|щит|світл|ламп|вимикач/i;
    const heatingRe = /опал|батаре|тепл|котел|радіатор/i;
    const sanitaryRe = /сантех|кран|унітаз|труб|вода|змішувач/i;
    const cleaningRe = /прибир|смітт|двір|під['’]?їзд.*бруд/i;
    const elevatorRe = /ліфт/i;

    if (urgentRe.test(text)) {
      priority = 'urgent';
      slaHoursHint = 4;
      reasons.push('ключові слова аварії/затоплення');
    } else if (highRe.test(text)) {
      priority = 'high';
      slaHoursHint = 12;
      reasons.push('серйозна несправність');
    } else if (/шум|парков|оголош|довідк/i.test(text)) {
      priority = 'low';
      slaHoursHint = 72;
      reasons.push('низький пріоритет за змістом');
    }

    if (electricRe.test(text)) {
      category = 'electric';
      reasons.push('електрика');
    } else if (heatingRe.test(text)) {
      category = 'heating';
      reasons.push('опалення');
    } else if (sanitaryRe.test(text)) {
      category = 'sanitary';
      reasons.push('сантехніка');
    } else if (cleaningRe.test(text)) {
      category = 'cleaning';
      reasons.push('прибирання');
    } else if (elevatorRe.test(text)) {
      category = 'elevator';
      reasons.push('ліфт');
    }

    return { priority, category, slaHoursHint, reasons };
  }

  /** Suggest bank match strategy from free-text purpose (heuristic). */
  suggestPaymentMatch(purpose: string): {
    hints: string[];
    lookForApartment: boolean;
    lookForIban: boolean;
  } {
    const hints: string[] = [];
    const lookForApartment = /кв\.?|квартир|apt/i.test(purpose);
    const lookForIban = /UA\d{2}/i.test(purpose.replace(/\s/g, ''));
    if (lookForApartment) hints.push('Витягти номер квартири з призначення');
    if (lookForIban) hints.push('Зіставити IBAN платника з карткою мешканця');
    if (/Петренко|Іванов|Сидоренко/i.test(purpose)) {
      hints.push('Можливий збіг за ПІБ (підтвердіть вручну)');
    }
    if (!hints.length) hints.push('Немає сильних сигналів — ручне зіставлення');
    return { hints, lookForApartment, lookForIban };
  }

  /** Draft announcement / agenda from month facts (template, not LLM). */
  draftBoardNote(facts: {
    period: string;
    totalIncome?: number;
    totalExpenses?: number;
    debtorsCount?: number;
    openRequests?: number;
  }): { title: string; body: string } {
    const title = `Підсумки ${facts.period}`;
    const lines = [
      `Шановні співвласники!`,
      ``,
      `Коротко про період ${facts.period}:`,
      facts.totalIncome != null ? `• Надійшло: ${facts.totalIncome} ₴` : null,
      facts.totalExpenses != null ? `• Витрачено: ${facts.totalExpenses} ₴` : null,
      facts.debtorsCount != null ? `• Квартир із боргом: ${facts.debtorsCount}` : null,
      facts.openRequests != null ? `• Відкритих заявок: ${facts.openRequests}` : null,
      ``,
      `Деталі — у кабінеті «Мій дім» (вкладка «Прозорість»).`,
      ``,
      `З повагою, правління`,
    ].filter((x) => x != null);
    return { title, body: lines.join('\n') };
  }
}
