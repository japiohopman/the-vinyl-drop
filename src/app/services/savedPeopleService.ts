import { NotFoundError, ValidationError } from './errors';
import { savedPeopleRepository, SavedPersonProfile, SavedPersonTarget } from '../repositories/savedPeopleRepository';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SavedPeopleService {
  async getSavedPeopleForUser(ownerUserId: string): Promise<SavedPersonProfile[]> {
    return savedPeopleRepository.listForOwner(ownerUserId.toLowerCase());
  }

  async isSavedPerson(ownerUserId: string, savedUserId: string): Promise<boolean> {
    if (ownerUserId.toLowerCase() === savedUserId.toLowerCase()) return false;
    if (!UUID_PATTERN.test(savedUserId)) return false;
    return savedPeopleRepository.isSaved(ownerUserId.toLowerCase(), savedUserId.toLowerCase());
  }

  async savePerson(ownerUserId: string, savedUserId: string): Promise<SavedPersonTarget> {
    const { ownerId, targetId } = this.validatePair(ownerUserId, savedUserId);
    const target = await savedPeopleRepository.findProfile(targetId);
    if (!target) throw new NotFoundError('Profile not found');
    await savedPeopleRepository.save(ownerId, targetId);
    return target;
  }

  async removePerson(ownerUserId: string, savedUserId: string): Promise<SavedPersonTarget> {
    const { ownerId, targetId } = this.validatePair(ownerUserId, savedUserId);
    const target = await savedPeopleRepository.findProfile(targetId);
    if (!target) throw new NotFoundError('Profile not found');
    await savedPeopleRepository.remove(ownerId, targetId);
    return target;
  }

  private validatePair(ownerUserId: string, savedUserId: string): { ownerId: string; targetId: string } {
    if (!UUID_PATTERN.test(savedUserId)) throw new NotFoundError('Profile not found');
    const ownerId = ownerUserId.toLowerCase();
    const targetId = savedUserId.toLowerCase();
    if (ownerId === targetId) throw new ValidationError('You cannot save your own profile');
    return { ownerId, targetId };
  }
}

export const savedPeopleService = new SavedPeopleService();
