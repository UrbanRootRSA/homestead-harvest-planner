// Click-to-copy for the contact email. Externalized from an inline <script>
// in contact.html (code-review 2026-06-10 M5) so the site CSP can drop
// 'unsafe-inline' from script-src — this was the only executable inline
// script on the whole origin.
(function () {
  var btn = document.getElementById("copy-btn");
  var addr = "urbanroot.contact@gmail.com";
  if (!btn) return;
  btn.addEventListener("click", function () {
    var done = function () {
      btn.textContent = "Copied";
      btn.classList.add("copied");
      setTimeout(function () {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(addr).then(done, function () {
        window.prompt("Copy the address:", addr);
      });
    } else {
      window.prompt("Copy the address:", addr);
    }
  });
})();
