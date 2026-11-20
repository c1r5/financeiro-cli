export class UuidGenerator {
	newId(): string {
		return crypto.randomUUID();
	}
}
