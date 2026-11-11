/** Every product that reports here. Adding one: its schema file, a line below, and a deploy (README › A new product). */
import type { Product } from '../schema.js'
import { yardhand } from './yardhand.js'

export const products: Record<string, Product> = { yardhand }
