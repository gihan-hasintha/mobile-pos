document.getElementById("application-navbar-for-subpage").innerHTML = `
  <div id="navigation-bar-for-application-head">
    <div class="navigation-bar-for-application-head-navbar">
      <div class="navigation-bar-for-application-head-content">
        <div class="navigation-bar-for-application-head-content-left" onclick="showcartlistoncashieraddedtocart()">
                    <div class="navigation-bar-for-application-head-content-right-button" onclick="history.back()">
              <img src="./assets/imgs/keyboard_backspace_50dp_FFFFFF_FILL0_wght400_GRAD0_opsz48.png" alt="" style="width: 28px;">
            </div>
        </div>
        <div class="navigation-bar-for-application-head-content-center">
          <div class="navbar-app-LOGO-img">
            <img src="./assets/imgs/IMAPOS_LOGO.png" alt="">
          </div>
        </div>
        <div class="navigation-bar-for-application-head-content-right">
          <div class="navigation-bar-for-application-head-content-right-c">
            <div class="navigation-bar-for-application-head-content-right-button" id="navigation-bar-for-application-head-content-right-button-close-searchbar-show" style="display: none;" onclick="openSearchModal()">
              <img src="./assets/imgs/search-interface-symbol.png" alt="">
            </div>

            <div class="navigation-bar-for-application-head-content-right-button" id="navigation-bar-for-application-head-content-right-button-close-searchbar" style="display: none;" onclick="closeSearchModal()">
              <img src="./assets/imgs/close_50dp_FFFFFF_FILL0_wght400_GRAD0_opsz48.png" alt="" style="width: 28px;">
            </div>

            <div class="navigation-bar-for-application-head-content-right-button" onclick="openmenubaronapplication()">
              <img src="./assets/imgs/menu_50dp_FFFFFF_FILL1_wght400_GRAD0_opsz48.png" alt="" style="width: 28px;">
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="navigation-bar-for-application-head-navbar-space"></div>
  </div>

  <div id="application-sideba-for-manage" style="display: block;">
    <div id="application-sideba-for-manage-div">
      <div class="application-sideba-for-manage-content">
        <div class="application-sideba-for-manage-content-card-layout">

          <a href="./expenses.html">
            <div class="application-sideba-for-manage-content-card-layout-card">
              <div class="application-sideba-for-manage-content-card-layout-content">
                <div class="application-sideba-for-manage-content-card-layout-img">
                  <img src="./assets/imgs/receipt_long_100dp_FFFFFF_FILL1_wght400_GRAD0_opsz48.png" alt="">
                </div>
                <div class="application-sideba-for-manage-content-card-layout-txt">
                  ADD expenses
                </div>
              </div>
            </div>
          </a>

          <a href="./sales_summary.html">
            <div class="application-sideba-for-manage-content-card-layout-card">
              <div class="application-sideba-for-manage-content-card-layout-content">
                <div class="application-sideba-for-manage-content-card-layout-img">
                  <img src="./assets/imgs/finance_100dp_FFFFFF_FILL1_wght400_GRAD0_opsz48.png" alt="">
                </div>
                <div class="application-sideba-for-manage-content-card-layout-txt">
                  Sales Summary
                </div>
              </div>
            </div>
          </a>

        </div>

        <div class="application-sideba-for-manage-content-card-layout">

          <a href="./returns.html">
            <div class="application-sideba-for-manage-content-card-layout-card">
            <div class="application-sideba-for-manage-content-card-layout-content">
              <div class="application-sideba-for-manage-content-card-layout-img">
                <img src="./assets/imgs/repeat_on_100dp_FFFFFF_FILL1_wght400_GRAD0_opsz48.png" alt="">
              </div>
              <div class="application-sideba-for-manage-content-card-layout-txt">
                Item Return
              </div>
            </div>
            </div>
          </a>

          <div class="application-sideba-for-manage-content-card-layout-card">
            <div class="application-sideba-for-manage-content-card-layout-content">
              <div class="application-sideba-for-manage-content-card-layout-img">
                <img src="./assets/imgs/shelves_100dp_FFFFFF_FILL1_wght400_GRAD0_opsz48.png" alt="">
              </div>
              <div class="application-sideba-for-manage-content-card-layout-txt">
                Stock Manage
              </div>
            </div>
          </div>

        </div>

        <div class="application-sideba-for-manage-content-card-layout">

          <div class="application-sideba-for-manage-content-card-layout-card">
            <div class="application-sideba-for-manage-content-card-layout-content">
              <div class="application-sideba-for-manage-content-card-layout-img">
                <img src="./assets/imgs/receipt_100dp_FFFFFF_FILL1_wght400_GRAD0_opsz48.png" alt="">
              </div>
              <div class="application-sideba-for-manage-content-card-layout-txt">
                Total Bill's
              </div>
            </div>
          </div>

          <a href="./access_manage.html">
            <div class="application-sideba-for-manage-content-card-layout-card">
              <div class="application-sideba-for-manage-content-card-layout-content">
                <div class="application-sideba-for-manage-content-card-layout-img">
                  <img src="./assets/imgs/identity_platform_100dp_FFFFFF_FILL1_wght400_GRAD0_opsz48.png" alt="">
                </div>
                <div class="application-sideba-for-manage-content-card-layout-txt">
                  Access Manage
                </div>
              </div>
            </div>
          </a>

        </div>
        <div class="application-sideba-for-manage-content-card-layout">

          <div class="application-sideba-for-manage-content-card-layout-card">
            <div class="application-sideba-for-manage-content-card-layout-content">
              <div class="application-sideba-for-manage-content-card-layout-img">
                <img src="./assets/imgs/add_diamond_100dp_FFFFFF_FILL1_wght400_GRAD0_opsz48.png" alt="">
              </div>
              <div class="application-sideba-for-manage-content-card-layout-txt">
                ADD items and categories
              </div>
            </div>
          </div>

          <a href="./customers.html">
            <div class="application-sideba-for-manage-content-card-layout-card">
            <div class="application-sideba-for-manage-content-card-layout-content">
              <div class="application-sideba-for-manage-content-card-layout-img">
                <img src="./assets/imgs/loyalty_100dp_FFFFFF_FILL1_wght400_GRAD0_opsz48.png" alt="">
              </div>
              <div class="application-sideba-for-manage-content-card-layout-txt">
                Customers
              </div>
            </div>
            </div>
          </a>
        </div>
        <div class="space-f0r-card-sectionsd0sdas-asdas"></div>
      </div>
    </div>
  </div>
`;