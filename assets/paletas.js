/* ==========================================================================
   Las paletas de aula de Moodle 5.1.

   Es la lista que decide el color del tema en una página: la clase va en el
   contenedor (`container-fluid mainPlantilla23 <clase>`) y de ahí salen los
   tokens `--primary-*` que pintan la barra del título, los encabezados de tabla
   y la rayita del <h1>.

   Vive en assets/ porque la usan varias herramientas (Guion Instruccional a
   Página y Bibliografías Margarita Maza). Duplicar estos hexadecimales es
   exactamente el error que dejó vivo el #d8a7b6 durante meses.

   El `color` es solo para la muestrita del selector; el color REAL lo pone la
   hoja del tema a partir de la clase.
   ========================================================================== */

const PALETAS = [
    { clase: 'M01', nombre: 'Módulo 1', color: '#8d67b7' },
    { clase: 'M02', nombre: 'Módulo 2', color: '#6597d8' },
    { clase: 'M03', nombre: 'Módulo 3', color: '#d15454' },
    { clase: 'MM', nombre: 'Margarita Maza', color: '#9d2248' },
    { clase: 'reg', nombre: 'Regular / DGB', color: '#215c50' }
];
