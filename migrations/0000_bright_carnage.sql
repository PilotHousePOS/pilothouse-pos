CREATE TABLE "appointment_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"owner_phone_number" varchar(20),
	"owner_email" varchar(255),
	"owner_first_name" varchar(255),
	"owner_last_name" varchar(255),
	"appointment_date" date NOT NULL,
	"appointment_time" varchar(20),
	"pet_name" varchar(255),
	"pet_type" varchar(100),
	"breed" varchar(255),
	"service_type" varchar(50),
	"groomer_name" varchar(255),
	"status" varchar(50),
	"source" varchar(50),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "appointment_pets" (
	"id" serial PRIMARY KEY NOT NULL,
	"appointment_id" integer NOT NULL,
	"pet_name" varchar(255) NOT NULL,
	"pet_type" varchar(100) NOT NULL,
	"service_type" varchar(100) NOT NULL,
	"groomer_id" integer,
	"price" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"groomer_id" integer,
	"service_type" varchar(100) NOT NULL,
	"appointment_date" date NOT NULL,
	"appointment_time" varchar(20) NOT NULL,
	"pet_name" varchar(255) NOT NULL,
	"pet_type" varchar(100) NOT NULL,
	"special_notes" text,
	"owner_first_name" varchar(255),
	"owner_last_name" varchar(255) NOT NULL,
	"owner_phone_number" varchar(20) NOT NULL,
	"status" varchar(50) DEFAULT 'scheduled',
	"is_approved" boolean DEFAULT false,
	"is_here" boolean DEFAULT false,
	"is_paid" boolean DEFAULT false,
	"price" numeric(10, 2) NOT NULL,
	"pricing_mode" varchar(20) DEFAULT 'individual',
	"source" varchar(50) DEFAULT 'manual',
	"google_event_id" varchar(255),
	"groomer_tag" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "boarding_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(255),
	"customer_phone" varchar(20) NOT NULL,
	"animal_type" varchar(100) NOT NULL,
	"animal_name" varchar(255) NOT NULL,
	"estimated_drop_off_date" date NOT NULL,
	"actual_drop_off_date" date,
	"estimated_pick_up_date" date NOT NULL,
	"actual_pick_up_date" date,
	"daily_rate" numeric(10, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"supply_id" integer,
	"pet_id" integer,
	"quantity" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone_number" varchar(20),
	"pet_names" text[],
	"notes" text,
	"animal_type" varchar(100),
	"breed" varchar(255),
	"linked_user_id" varchar,
	"source" varchar(50) DEFAULT 'manual',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_pets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"species" varchar(100) NOT NULL,
	"breed" varchar(255),
	"age" varchar(50),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_appointment_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"max_bath_appointments" integer DEFAULT 5 NOT NULL,
	"max_groom_appointments" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "daily_appointment_limits_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "groomer_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"groomer_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"is_available" boolean DEFAULT true,
	"start_time" varchar(10),
	"end_time" varchar(10),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "groomers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"specialties" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "grooming_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"setting" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "grooming_settings_setting_unique" UNIQUE("setting")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"supply_id" integer,
	"pet_id" integer,
	"quantity" integer DEFAULT 1,
	"price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"shipping_address" text,
	"order_date" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(255) NOT NULL,
	"user_id" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"species" varchar(100) NOT NULL,
	"breed" varchar(255) NOT NULL,
	"age" varchar(50) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"description" text,
	"image_url" varchar(500),
	"image_urls" text[],
	"is_available" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"section" varchar(10) NOT NULL,
	"employee_name" varchar(255) NOT NULL,
	"day_of_week" varchar(20) NOT NULL,
	"time_slot" varchar(100) NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_date_allowed_times" (
	"id" serial PRIMARY KEY NOT NULL,
	"special_date_id" integer NOT NULL,
	"allowed_time" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "special_date_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "special_date_settings_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "supplies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"brand" varchar(255),
	"price" numeric(10, 2) NOT NULL,
	"description" text,
	"image_url" varchar(500),
	"image_urls" text[],
	"stock_quantity" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"weight" varchar(50),
	"size" varchar(50),
	"filter_type" varchar(20),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supply_import_staging" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_session_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"brand" varchar(255),
	"price" numeric(10, 2) NOT NULL,
	"description" text,
	"stock_quantity" integer DEFAULT 0,
	"size" varchar(50),
	"weight" varchar(50),
	"sku" varchar(100),
	"composite_key" varchar(500) NOT NULL,
	"normalized_sku" varchar(100),
	"data_checksum" varchar(64) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"matched_supply_id" integer,
	"conflict_reason" text,
	"row_number" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"password" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"phone_number" varchar(20),
	"is_admin" boolean DEFAULT false,
	"is_groomer" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_appointment_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_of_week" integer NOT NULL,
	"max_bath_appointments" integer DEFAULT 5 NOT NULL,
	"max_groom_appointments" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "weekly_appointment_limits_day_of_week_unique" UNIQUE("day_of_week")
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"supply_id" integer,
	"pet_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_pets" ADD CONSTRAINT "appointment_pets_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_pets" ADD CONSTRAINT "appointment_pets_groomer_id_groomers_id_fk" FOREIGN KEY ("groomer_id") REFERENCES "public"."groomers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_groomer_id_groomers_id_fk" FOREIGN KEY ("groomer_id") REFERENCES "public"."groomers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_pets" ADD CONSTRAINT "customer_pets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groomer_availability" ADD CONSTRAINT "groomer_availability_groomer_id_groomers_id_fk" FOREIGN KEY ("groomer_id") REFERENCES "public"."groomers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_date_allowed_times" ADD CONSTRAINT "special_date_allowed_times_special_date_id_special_date_settings_id_fk" FOREIGN KEY ("special_date_id") REFERENCES "public"."special_date_settings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_import_staging" ADD CONSTRAINT "supply_import_staging_matched_supply_id_supplies_id_fk" FOREIGN KEY ("matched_supply_id") REFERENCES "public"."supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_history_contact_id_idx" ON "appointment_history" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "appointment_history_date_idx" ON "appointment_history" USING btree ("appointment_date");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "staging_composite_key_idx" ON "supply_import_staging" USING btree ("import_session_id","composite_key");--> statement-breakpoint
CREATE INDEX "staging_sku_idx" ON "supply_import_staging" USING btree ("normalized_sku");