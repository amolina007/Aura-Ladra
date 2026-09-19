# Reglas para el agente — Proyecto AuraLadra

## Sobre mí
Estoy aprendiendo a programar desde cero. No asumas que entiendo jerga técnica.

## Cómo quiero que trabajes
- Explícame cada cambio en español, en términos simples, ANTES de aplicarlo.
- Dime qué archivo vas a modificar y por qué, antes de hacerlo.
- Si algo tiene varias formas de resolverse, explícame las opciones brevemente en vez de elegir por mí.
- Prefiero cambios pequeños y probados uno por uno, no varios cambios grandes juntos.

## Sobre este proyecto
- Es un sitio HTML/CSS/JS plano, sin build step. No agregues frameworks, bundlers
  ni herramientas de compilación sin consultarme primero.
- El backend es Supabase. El schema de este sitio es `ladra` — nunca toques el
  schema `public` (pertenece a otro sitio, AuraRitmos, que comparte el mismo proyecto Supabase).
- No expongas ni escribas claves secretas (service_role, contraseñas de base de datos)
  en ningún archivo del repositorio. Solo la URL pública y la publishable key van en el código.

## Sobre Git
- Nunca hagas push ni merge directo a la rama main sin que yo lo pida explícitamente.
- Todo cambio se hace y se prueba primero en la rama dev.