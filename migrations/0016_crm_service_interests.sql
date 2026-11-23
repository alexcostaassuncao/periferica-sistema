INSERT INTO lead_products(id,lead_id,category,name,amount_cents,position,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),lead_id,'gestao','Gestão de Marketing',0,position+1,created_at,updated_at
  FROM lead_products
  WHERE (lower(name) LIKE '%gestão%' OR lower(name) LIKE '%gestao%' OR lower(name) LIKE '%marketing%' OR lower(name) LIKE '%social%')
    AND (lower(name) LIKE '%tráfego%' OR lower(name) LIKE '%trafego%' OR lower(name) LIKE '%ads%');
--> statement-breakpoint
UPDATE lead_products SET category='projeto',name='Loja Virtual / E-commerce'
  WHERE lower(name) LIKE '%e-commerce%' OR lower(name) LIKE '%ecommerce%' OR lower(name) LIKE '%loja virtual%' OR lower(name) LIKE '%loja online%';
--> statement-breakpoint
UPDATE lead_products SET category='projeto',name='Criação de Sites'
  WHERE lower(name) LIKE '%site%' OR lower(name) LIKE '%website%' OR lower(name) LIKE '%landing page%';
--> statement-breakpoint
UPDATE lead_products SET category='projeto',name='Branding / Identidade Visual'
  WHERE lower(name) LIKE '%branding%' OR lower(name) LIKE '%identidade%' OR lower(name) LIKE '%logo%';
--> statement-breakpoint
UPDATE lead_products SET category='outro',name='Automação com IA'
  WHERE lower(name) LIKE '%automação%' OR lower(name) LIKE '%automacao%' OR lower(name) LIKE '%ia visual%';
--> statement-breakpoint
UPDATE lead_products SET category='gestao',name='Tráfego Pago'
  WHERE lower(name) LIKE '%tráfego%' OR lower(name) LIKE '%trafego%' OR lower(name) LIKE '%ads pro%' OR lower(name) LIKE '%anúncio%' OR lower(name) LIKE '%anuncio%';
--> statement-breakpoint
UPDATE lead_products SET category='gestao',name='Gestão de Marketing'
  WHERE (lower(name) LIKE '%gestão%' OR lower(name) LIKE '%gestao%' OR lower(name) LIKE '%marketing%' OR lower(name) LIKE '%social media%' OR lower(name) LIKE '%redes sociais%' OR lower(name) LIKE '%smart business%')
    AND name<>'Tráfego Pago';
--> statement-breakpoint
UPDATE lead_products SET category='outro',name='Outros serviços'
  WHERE lower(name) IN ('outro','outros','outro assunto','outros serviços','other services','blog','web banner','banner impresso','material gráfico','material grafico');
--> statement-breakpoint
CREATE TEMP TABLE lead_products_rollup AS
  SELECT lead_id,category,name,SUM(amount_cents) AS amount_cents,MIN(position) AS position,
    MIN(created_at) AS created_at,MAX(updated_at) AS updated_at
  FROM lead_products GROUP BY lead_id,category,name;
--> statement-breakpoint
DELETE FROM lead_products;
--> statement-breakpoint
INSERT INTO lead_products(id,lead_id,category,name,amount_cents,position,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),lead_id,category,name,amount_cents,position,created_at,updated_at FROM lead_products_rollup;
--> statement-breakpoint
DROP TABLE lead_products_rollup;
--> statement-breakpoint
CREATE UNIQUE INDEX lead_products_lead_name ON lead_products(lead_id,name);
