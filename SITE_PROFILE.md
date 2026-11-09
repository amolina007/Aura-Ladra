# Perfil por sitio — desarrollo

Sitio: `auraladra`. El menú de cuenta de Core permite configurar un nick y una foto propios. Cada campo vacío hereda el valor actual de Aura; guardar aquí nunca cambia `core.perfiles`. Los nombres legales y los datos funcionales del sitio se conservan.

Servicio compartido: `AuraCore/js/aura-site-profile.js`, tabla de desarrollo `core.site_profiles_dev`, clave `(user_id, site)`. El servidor limita la edición a la cuenta propietaria. Los campos son identidad visible, no credenciales ni permisos.

Los cargadores solo activan esta integración en dominios de desarrollo o localhost. No promover a producción sin definir su almacenamiento y despliegue.
