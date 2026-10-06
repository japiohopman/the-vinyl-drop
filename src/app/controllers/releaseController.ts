import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';
import { importDiscogsRelease } from '../services/discogsService';
import { createRelease } from '../services/releaseService';
import { FormViewModel } from '../view-models/formViewModel';

export async function getCreateCustomReleasePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const formVm: FormViewModel<{
      artist?: string;
      title?: string;
      label?: string;
      catalogueNumber?: string;
      releaseYear?: string;
      format?: string;
      barcode?: string;
      genre?: string;
    }> = {
      values: {
        format: 'LP',
      },
      fieldErrors: {},
      generalErrors: [],
    };

    renderWithLayout(res, 'releases/new', {
      title: 'Add Custom Release - The Vinyl Drop',
      form: formVm,
    });
  } catch (error) {
    next(error);
  }
}

export async function postCreateCustomRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { artist, title, label, catalogueNumber, releaseYear, format, barcode, genre } = req.body;

    const parsedYear = releaseYear ? parseInt(releaseYear, 10) : undefined;

    try {
      const release = await createRelease({
        artist,
        title,
        label: label || undefined,
        catalogueNumber: catalogueNumber || undefined,
        releaseYear: parsedYear && !isNaN(parsedYear) ? parsedYear : undefined,
        format: format || 'LP',
        barcode: barcode || undefined,
        genre: genre || undefined,
        externalSource: 'custom',
      });

      return res.redirect(`/listings/create?releaseId=${release.id}`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create release';
      const formVm: FormViewModel<Record<string, string>> = {
        values: req.body,
        fieldErrors: {},
        generalErrors: [errorMsg],
      };
      return renderWithLayout(res, 'releases/new', {
        title: 'Add Custom Release - The Vinyl Drop',
        form: formVm,
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function postImportDiscogsRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const discogsId = parseInt(req.body.discogsId, 10);
    if (isNaN(discogsId) || discogsId <= 0) {
      return res.redirect('/drop/new');
    }

    const release = await importDiscogsRelease(discogsId);
    return res.redirect(`/listings/create?releaseId=${release.id}`);
  } catch (error) {
    next(error);
  }
}
