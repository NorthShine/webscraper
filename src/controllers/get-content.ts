import ApiError from '../exceptions/api-errors';
import { Response, Request, NextFunction } from 'express';
import { firefox } from 'playwright';

interface UserComment {
  user: string;
  text: string;
  dateCreated: string;
}

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
    await page.goto(url, {
      waitUntil: 'load',
      timeout: 0
    });
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

      const getInnerText = (el: Document | Element | HTMLElement | null, selector: string) => {
        const target = el?.querySelector(selector) as HTMLElement | null;
        return target?.innerText ?? '';
      }

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
        const metaAuthor = document
          .querySelector('meta[name="author"]')?.getAttribute('content');
        if (metaAuthor) {
          return metaAuthor;
        }

        const schemaAuthor = getInnerText(
          document,
          '[itemtype="https://schema.org/Person"][itemprop="author"] [itemprop="name"]'
        );
        if (schemaAuthor) {
          return schemaAuthor;
        }

        const classAuthor = getInnerText(document, '.author, #author, [name="author"]');
        if (classAuthor) {
          return classAuthor;
        }

        return '';
      };

      const getDescription = (document: Document): string => {
        const metaDescription = document.querySelector('meta[name="description"]')
          ?.getAttribute('content');
        return metaDescription ?? '';
      }

      const getUserComments = (document: Document): UserComment[] => {
        const comments = document.querySelectorAll('[itemtype="http://schema.org/Comment"]');
        return Array.from(comments).map(el => {
          const dateCreatedElement = el
            .querySelector('[itemprop="dateCreated"]') as HTMLElement | null;
          const dateCreated = dateCreatedElement?.getAttribute("datetime") ?? '';

          return {
            user: getInnerText(el, '[itemprop="author"]'),
            text: getInnerText(el, '[itemprop="text"]'),
            dateCreated
          }
        })
      }

      const externalLinks = Array.from(document.querySelectorAll('a'))
        .reduce((acc: string[], el) => {
          const link = el.href;
          const url = new URL(link);
          if (!acc.includes(link) && !document.URL.includes(url.origin)) {
            acc.push(link);
          };
          return acc;
        }, [])

      return {
        title: document.title,
        lastModified: document.lastModified,
        description: formatText(getDescription(document)),
        text: formatText(contentElement.innerText),
        comments: getUserComments(document),
        images,
        externalLinks,
        author: formatText(getAuthor(document))
      };
    });
    await browser.close();
    return res.status(200).json(data).end();
  } catch (err) {
    next(err);
  }
};
