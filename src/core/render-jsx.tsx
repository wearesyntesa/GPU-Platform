import type { Response } from 'express';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import type { ComponentType, ReactElement } from 'react';

export function renderJsx<P extends object>(
  res: Response,
  Component: ComponentType<P>,
  props: P,
): void {
  const element = React.createElement(Component, props);
  const markup = renderToStaticMarkup(element as ReactElement);
  const csrfToken = res.locals.csrfToken as string | undefined;
  const html = '<!doctype html>' + injectCsrfToken(markup, csrfToken);
  res.type('html').send(html);
}

function injectCsrfToken(html: string, csrfToken?: string): string {
  if (!csrfToken) return html;
  const input = `<input type="hidden" name="_csrf" value="${csrfToken}" />`;
  return html.replace(/(<form\b(?=[^>]*\bmethod=["']post["'])[^>]*>)/gi, `$1${input}`);
}
