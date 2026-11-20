import type { GeradorDeId } from 'financeiro-sdk';

export class UuidGenerator implements GeradorDeId {
	novoId(): string {
		return crypto.randomUUID();
	}
}
