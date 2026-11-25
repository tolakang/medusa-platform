import {
  AdminCustomer,
  AdminOrder,
  AdminUser,
  StoreCart,
} from "@medusajs/framework/types";
import { ModuleQuote, ModuleQuoteMessage } from "./module";
import { QueryEmployee } from "../company/index";

export type QueryQuote = ModuleQuote & {
  draft_order: AdminOrder;
  cart: StoreCart;
  customer: AdminCustomer & {
    employee: QueryEmployee;
  };
  messages: QueryQuoteMessage[];
};

export type QueryQuoteMessage = ModuleQuoteMessage & {
  created_at?: string | Date;
  customer: AdminCustomer;
  admin: AdminUser;
};
