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
  const html = '<!doctype html>' + renderToStaticMarkup(element as ReactElement);
  res.type('html').send(html);
}
