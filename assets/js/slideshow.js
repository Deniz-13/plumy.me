(function () {
  var VERSION = "2026-05-31";
  var existing = window.HugoSlideshow;

  if (existing && existing.version === VERSION && typeof existing.init === "function") {
    existing.init(document);
    return;
  }

  var lightbox = null;
  var observerStarted = false;
  var observerQueued = false;

  function each(list, callback) {
    Array.prototype.forEach.call(list, callback);
  }

  function ensureLightbox() {
    if (lightbox && document.body.contains(lightbox)) {
      return lightbox;
    }

    var stale = document.querySelector(".hg-lightbox");
    if (stale) {
      stale.parentNode.removeChild(stale);
    }

    lightbox = document.createElement("div");
    lightbox.className = "hg-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.style.display = "none";

    var img = document.createElement("img");
    lightbox.appendChild(img);

    var close = document.createElement("button");
    close.className = "hg-lightbox__close";
    close.setAttribute("aria-label", "Kapat");
    close.innerHTML = "&#x2715;";
    lightbox.appendChild(close);

    var caption = document.createElement("p");
    caption.className = "hg-lightbox__caption";
    lightbox.appendChild(caption);

    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) {
        closeLightbox();
      }
    });

    close.addEventListener("click", closeLightbox);
    document.body.appendChild(lightbox);

    return lightbox;
  }

  function openLightbox(src, captionText) {
    var box = ensureLightbox();
    var img = box.querySelector("img");
    var caption = box.querySelector(".hg-lightbox__caption");

    img.src = src;
    caption.textContent = captionText || "";
    box.style.display = "flex";

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        box.classList.add("open");
      });
    });

    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    if (!lightbox) {
      return;
    }

    lightbox.classList.remove("open");
    lightbox.addEventListener("transitionend", function hide() {
      lightbox.style.display = "none";
      lightbox.removeEventListener("transitionend", hide);
    });

    document.body.style.overflow = "";
  }

  function findSlideshows(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var slideshows = [];

    if (scope.matches && scope.matches("[data-slideshow]")) {
      slideshows.push(scope);
    }

    each(scope.querySelectorAll("[data-slideshow]"), function (slideshow) {
      slideshows.push(slideshow);
    });

    return slideshows;
  }

  function initOne(slideshow) {
    if (slideshow.dataset.slideshowReady === "1") {
      return;
    }

    var slides = Array.prototype.slice.call(slideshow.querySelectorAll(".hg-slide"));
    if (!slides.length) {
      return;
    }

    slideshow.dataset.slideshowReady = "1";

    var dotsWrap = slideshow.querySelector(".hg-slideshow__dots");
    var counter = slideshow.querySelector(".hg-slideshow__counter");
    var captionEl = slideshow.querySelector(".hg-slideshow__caption");
    var btnPrev = slideshow.querySelector(".hg-slideshow__btn--prev");
    var btnNext = slideshow.querySelector(".hg-slideshow__btn--next");
    var hasMultiple = slides.length > 1;
    var current = 0;
    var dots = [];
    var touchStartX = 0;

    if (dotsWrap) {
      dotsWrap.textContent = "";
      dotsWrap.style.display = hasMultiple ? "" : "none";
    }

    if (btnPrev) {
      btnPrev.style.display = hasMultiple ? "" : "none";
    }

    if (btnNext) {
      btnNext.style.display = hasMultiple ? "" : "none";
    }

    if (counter) {
      counter.style.display = hasMultiple ? "" : "none";
    }

    slides.forEach(function (slide, index) {
      slide.classList.toggle("active", index === current);

      var img = slide.querySelector("img");
      if (img) {
        img.addEventListener("click", function () {
          openLightbox(img.currentSrc || img.src, slide.dataset.caption || "");
        });
      }

      if (dotsWrap) {
        var dot = document.createElement("button");
        dot.className = "hg-slideshow__dot";
        dot.setAttribute("aria-label", (index + 1) + ". slayt");
        dot.addEventListener("click", function () {
          goTo(index);
        });
        dotsWrap.appendChild(dot);
        dots.push(dot);
      }
    });

    function updateUI() {
      if (counter) {
        counter.textContent = (current + 1) + " / " + slides.length;
      }

      if (captionEl) {
        captionEl.textContent = slides[current].dataset.caption || "";
      }

      dots.forEach(function (dot, index) {
        dot.classList.toggle("active", index === current);
      });
    }

    function goTo(nextIndex) {
      if (!hasMultiple) {
        return;
      }

      slides[current].classList.remove("active");
      current = (nextIndex + slides.length) % slides.length;
      slides[current].classList.add("active");
      updateUI();
    }

    updateUI();

    if (hasMultiple && btnPrev) {
      btnPrev.addEventListener("click", function () {
        goTo(current - 1);
      });
    }

    if (hasMultiple && btnNext) {
      btnNext.addEventListener("click", function () {
        goTo(current + 1);
      });
    }

    if (hasMultiple) {
      slideshow.addEventListener("keydown", function (event) {
        if (event.key === "ArrowLeft") {
          goTo(current - 1);
        }

        if (event.key === "ArrowRight") {
          goTo(current + 1);
        }
      });

      slideshow.addEventListener("touchstart", function (event) {
        touchStartX = event.touches[0].clientX;
      }, { passive: true });

      slideshow.addEventListener("touchend", function (event) {
        var deltaX = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(deltaX) > 40) {
          goTo(deltaX < 0 ? current + 1 : current - 1);
        }
      }, { passive: true });
    }
  }

  function init(root) {
    findSlideshows(root).forEach(initOne);
  }

  function queueInit() {
    if (observerQueued) {
      return;
    }

    observerQueued = true;
    requestAnimationFrame(function () {
      observerQueued = false;
      init(document);
    });
  }

  function startObserver() {
    if (observerStarted || !("MutationObserver" in window) || !document.documentElement) {
      return;
    }

    observerStarted = true;
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
          queueInit();
          return;
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function boot() {
    init(document);
    startObserver();
  }

  window.HugoSlideshow = {
    version: VERSION,
    init: init,
    openLightbox: openLightbox,
    closeLightbox: closeLightbox
  };

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeLightbox();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.addEventListener("pageshow", boot);
  window.addEventListener("load", boot, { once: true });
})();
