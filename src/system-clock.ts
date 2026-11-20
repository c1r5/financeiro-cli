import type { Relogio } from 'financeiro-sdk';

/** Data civil no fuso local. O instante de `agora` continua em UTC. */
export class SystemClock implements Relogio {
	hoje(): string {
		const agora = new Date();
		const mes = String(agora.getMonth() + 1).padStart(2, '0');
		const dia = String(agora.getDate()).padStart(2, '0');
		return `${agora.getFullYear()}-${mes}-${dia}`;
	}

	agora(): string {
		return new Date().toISOString();
	}
}
