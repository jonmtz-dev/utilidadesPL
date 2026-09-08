/* Base de Bootstrap necesaria para los bloques de AA; después carga el tema real. */
window.CSS_PREVIA_AA = `
*{box-sizing:border-box}body{margin:0;background:#fff;color:#212529;font:16px/1.5 "Atkinson Hyperlegible Next",Arial,sans-serif}
h1,h2{margin-top:0;margin-bottom:.5rem;font-weight:500;line-height:1.2}h1{font-size:2.5rem}h2{font-size:2rem}
p{margin-top:0;margin-bottom:1rem}hr{margin:1rem 0;border:0;border-top:1px solid;opacity:.25}
.container-fluid{width:100%;padding-right:12px;padding-left:12px;margin:auto}.row{display:flex;flex-wrap:wrap;margin-right:-12px;margin-left:-12px}.row>*{flex-shrink:0;width:100%;max-width:100%;padding-right:12px;padding-left:12px}
.col-12,.col-sm-12{flex:0 0 auto;width:100%}.col-10{flex:0 0 auto;width:83.333333%}.mx-auto{margin-left:auto!important;margin-right:auto!important}
.ms-4{margin-left:1.5rem!important}blockquote{margin-top:0;margin-bottom:1rem}.p-4{padding:1.5rem!important}.pb-0{padding-bottom:0!important}.mt-3{margin-top:1rem!important}.mt-4{margin-top:1.5rem!important}.my-2{margin-top:.5rem!important;margin-bottom:.5rem!important}
.text-center{text-align:center!important}.text-end{text-align:right!important}.text-muted{color:#6c757d!important}.align-middle{vertical-align:middle!important}
.rounded-1{border-radius:.25rem!important}.rounded-2{border-radius:.375rem!important}.border{border:1px solid #dee2e6!important}
.table{width:100%;border-collapse:collapse;margin-bottom:1rem;vertical-align:top}.table>:not(caption)>*>*{padding:.5rem;background-color:#fff;border-bottom:1px solid #dee2e6}.table-bordered>:not(caption)>*>*{border-width:1px;border-style:solid;border-color:#dee2e6}.table-responsive{overflow-x:auto}
.img-fluid{max-width:100%;height:auto}.d-block{display:block!important}.d-none{display:none!important}.opacity-10{opacity:.1!important}ol,ul{padding-left:2rem}ol ol,ol ul{margin-bottom:0}
@media(min-width:576px){.d-sm-block{display:block!important}.d-sm-none{display:none!important}}
@media(min-width:768px){.d-md-none{display:none!important}}
`;
