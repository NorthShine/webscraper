import ApiError from '../exceptions/api-errors';
import { Response, Request, NextFunction } from 'express';
import { firefox } from 'playwright';

export const getContent = async (req: Request, res: Response, next: NextFunction) => {
  const { url } = req.query;

  if (!url) {
    return next(ApiError.badRequest('Missing url'));
  }

  if (typeof url !== 'string') {
    return next(ApiError.badRequest("Query param 'url' has to be of type string"));
  }

  try {
    const browser = await firefox.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForSelector('body');
    const data = await page.evaluate(() => {
      const body = document.body;

      const getContentElement = (body: HTMLElement): HTMLElement => {
        const article = body.querySelector('article');
        if (article) {
          return article;
        }
        const main = body.querySelector('main');
        if (main) {
          return main;
        }
        return body;
      };

      const contentElement = getContentElement(body);

      const formatText = (str: string): string => {
        return str.replace(/\s+/gi, ' ').trim();
      };

      const text = formatText(contentElement.innerText);
      const images = Array.from(contentElement.querySelectorAll('img')).reduce(
        (acc: string[], img) => {
          const src = img.src;
          if (src && !acc.includes(src)) {
            acc.push(src);
          }
          return acc;
        },
        []
      );

      const getAuthor = (document: Document): string => {
        const metaAuthor = document.querySelector('meta[name="author"]')?.getAttribute('content');
        if (metaAuthor) {
          return metaAuthor;
        }

        const schemaAuthor = document.querySelector(
          '[itemprop="author"] [itemprop="name"]'
        ) as HTMLElement | null;
        if (schemaAuthor) {
          return schemaAuthor.innerText;
        }

        const classAuthor = document.querySelector(
          '.author, #author, [name="author"]'
        ) as HTMLElement | null;
        if (classAuthor) {
          return classAuthor.innerText;
        }

        return '';
      };

      const author = formatText(getAuthor(document));

      return {
        text,
        images,
        author
      };
    });
    await browser.close();
    return res.status(200).json(data).end();
  } catch (err) {
    next(err);
  }
};
