/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { WhatsAppProviderHandler } from './whatsapp-provider.handler';
import { ExchangeRateUnavailableError } from '../exchange-rate/exchange-rate.service';

const PHONE = '+5215555550000';
const PROVIDER_ID = 'provider-1';
const TZ = 'America/Mexico_City';

function makeHandler() {
  const noop = null as any;
  const expenseService = {
    create: jest.fn().mockResolvedValue({ id: 'expense-1' }),
    formatExpenseConfirmation: jest.fn().mockReturnValue('confirmado'),
  };
  const exchangeRateService = {
    convertToMxn: jest.fn(),
  };

  const handler = new (WhatsAppProviderHandler as any)(
    noop, // whatsapp
    noop, // prisma
    noop, // redis
    noop, // eventEmitter
    noop, // onboardingHandler
    noop, // aiService
    noop, // aiContextService
    noop, // incomeService
    expenseService, // expenseService
    noop, // recurringExpenseService
    noop, // appointmentsService
    noop, // workspaceService
    noop, // timezoneMigrationService
    noop, // providerModelService
    noop, // queueService
    noop, // remindersService
    noop, // paymentsService
    noop, // contactsService
    noop, // attributionQueue
    exchangeRateService, // exchangeRateService
  );

  jest.spyOn(handler, 'sendFinancialConfirmation').mockResolvedValue(undefined);
  jest.spyOn(handler, 'sendAndRecord').mockResolvedValue(undefined);

  return { handler, expenseService, exchangeRateService };
}

describe('WhatsAppProviderHandler — foreign currency expenses', () => {
  it('registers MXN expenses without FX metadata', async () => {
    const { handler, expenseService, exchangeRateService } = makeHandler();
    exchangeRateService.convertToMxn.mockResolvedValueOnce(null);

    await handler.handleRegistrarGasto(
      PHONE,
      { amount: 500, description: 'material' },
      PROVIDER_ID,
      TZ,
      'hash-1',
    );

    expect(exchangeRateService.convertToMxn).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500,
        currency: undefined,
        timezone: TZ,
      }),
    );
    expect(expenseService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: PROVIDER_ID,
        amount: 500,
        currency: 'MXN',
        originalAmount: undefined,
        originalCurrency: undefined,
      }),
    );
  });

  it('stores converted MXN amount plus original USD metadata', async () => {
    const { handler, expenseService, exchangeRateService } = makeHandler();
    const exchangeRateDate = new Date('2026-06-21T00:00:00.000Z');
    exchangeRateService.convertToMxn.mockResolvedValueOnce({
      originalAmount: 35,
      originalCurrency: 'USD',
      convertedAmount: 647.5,
      convertedCurrency: 'MXN',
      exchangeRate: 18.5,
      exchangeRateProvider: 'frankfurter',
      exchangeRateDate,
    });

    await handler.handleRegistrarGasto(
      PHONE,
      { amount: 35, currency: 'USD', description: 'material' },
      PROVIDER_ID,
      TZ,
      'hash-1',
    );

    expect(expenseService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: PROVIDER_ID,
        amount: 647.5,
        currency: 'MXN',
        originalAmount: 35,
        originalCurrency: 'USD',
        exchangeRate: 18.5,
        exchangeRateProvider: 'frankfurter',
        exchangeRateDate,
      }),
    );
    expect(expenseService.formatExpenseConfirmation).toHaveBeenCalledWith(
      647.5,
      undefined,
      'material',
      {
        originalAmount: 35,
        originalCurrency: 'USD',
        exchangeRate: 18.5,
        exchangeRateDate,
      },
    );
  });

  it('does not create an expense when FX lookup fails', async () => {
    const { handler, expenseService, exchangeRateService } = makeHandler();
    exchangeRateService.convertToMxn.mockRejectedValueOnce(
      new ExchangeRateUnavailableError('no rate'),
    );

    await handler.handleRegistrarGasto(
      PHONE,
      { amount: 35, currency: 'USD', description: 'material' },
      PROVIDER_ID,
      TZ,
      'hash-1',
    );

    expect(expenseService.create).not.toHaveBeenCalled();
    expect(handler.sendAndRecord).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining('tipo de cambio'),
    );
  });
});
