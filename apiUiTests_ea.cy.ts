/// <reference types="cypress" />

describe('Energy Australia API and UI Tests for Web QE role', () => {
  
  const API_URL = 'https://eacp.energyaustralia.com.au/codingtest/api/v1/festivals';
  context('API Tests verifications', () => {

    // expected scenarios
    it('should successfully fetch non-empty festival data', () => {
      cy.request({
        method: 'GET',
        url: API_URL,
        headers: { accept: 'text/plain' }
      }).should((response) => {
        cy.wrap(response.status).should('eq', 200);
        cy.wrap(response.body).should('be.instanceOf', Array);
        cy.wrap(response.body).should('not.be.empty'); // making sure that no empty array
      });
    });

    // log 429 httpErrorCode
    it('should log API throttling 429 error', () => {
      cy.request({ method: 'GET', url: API_URL, headers: { accept: 'text/plain' }, failOnStatusCode: false }).should((response) => {
        if (response.status === 429) {
          cy.log('rate limit exceeded for festival data API');
        }
      });
    });

    // validate response model structure
    it('should verify the structure of festival data', () => {
      cy.request({ method: 'GET', url: API_URL, headers: { accept: 'text/plain' } }).then((response) => {
        response.body.forEach((festival) => {
          cy.wrap(festival).should('have.property', 'name').and('be.a', 'string');
          cy.wrap(festival).should('have.property', 'bands');
          festival.bands.forEach((band) => {
            cy.wrap(band).should('have.property', 'name').and('be.a', 'string');
            cy.wrap(band).should('have.property', 'recordLabel').and('be.a', 'string');
          });
        });
      });
    });

    // check with the requirements whether these blank values are allowed, if not then log
    it('should handle missing festival names, band names and record labels', () => {
      cy.request({ method: 'GET', url: API_URL, headers: { accept: 'text/plain' } }).then((response) => {
        response.body.forEach((festival) => {
          if (!festival.name) {
            cy.log('Festival with missing name detected');
          }
          festival.bands.forEach((band) => {
            if (!band.name) {
              cy.log('Band with missing name detected');
            }
            if (!band.recordLabel) {
              cy.log(`Band ${band.name} has no record label`);
            }
          });
        });
      });
    });

    // desirable scenario, 800ms threshold on a single GET - performance
    it('should respond within 800ms', () => {
      cy.request({ method: 'GET', url: API_URL, headers: { accept: 'text/plain' } })
        .then((response) => {
      cy.wrap(response.duration).should('be.lessThan', 800);
      });
    });

    // desirable scenario (negative)
    it('should return 404 for a random endpoint', () => {
      cy.request({ method: 'GET', url: `${API_URL}/some-random-endpoint`, failOnStatusCode: false})
        .then((response) => {
      cy.wrap(response.status).should('eq', 404);
      });
    });

  });

  context('UI Tests verifications', () => {

    beforeEach(() => {
      // tried with the local setup ,but the project libraries are too old to run locally
      cy.visit('http://localhost:3000/'); // Update with actual app URL environment specific
    });

    it('should display festival data correctly on the page', () => {
      cy.intercept('GET', API_URL).as('getFestivals');
      cy.wait('@getFestivals').then(({ response }) => {
        response.body.forEach((festival) => {
          if (festival.name) {
            cy.contains(festival.name).should('be.visible');
          } else {
              cy.log('Skipping assertion: festival name is missing in API response');
            }
          festival.bands.forEach((band) => {
            if (band.name) {
              cy.get('.festival-container').within(() => {
                cy.contains(band.name).should('be.visible');
              });
            } else {
              cy.log('Skipping assertion: Band name is missing in API response');
            }
            if (band.recordLabel) {
              cy.get('.festival-container').within(() => {
                cy.contains(band.recordLabel).should('be.visible');
              });
            } else {
              cy.log('Skipping assertion: band recordLabel is missing in API response');
            }
          });
        });
      });
    });

    // this is as per the requirement if page need to show festival data in alphabetic order
    it('should display festivals and bands in alphabetical order', () => {
      let previousFestival = '';
      cy.get('.festival-name').each(($el) => {
        const currentFestival = $el.text().trim();
        expect(currentFestival.localeCompare(previousFestival)).to.be.at.least(0);
        previousFestival = currentFestival;
      });

      cy.get('.festival-container').each(($festival) => {
        let previousBand = '';
        cy.wrap($festival).find('.band-name').each(($el) => {
          const currentBand = $el.text().trim();
          expect(currentBand.localeCompare(previousBand)).to.be.at.least(0);
          previousBand = currentBand;
        });
      });
    });

    // negative scenario: what happens on the page when empty festivals json from API
    it('should handle empty API response gracefully on page', () => {
      cy.intercept('GET', API_URL, []).as('emptyFestivals');
      cy.visit('http://localhost:3000/');
      cy.wait('@emptyFestivals');
      cy.get('.festival-container').should('not.exist');
      cy.contains('No festivals available at this time').should('be.visible'); // check for the requirements for the exact stmt
    });

    // if the page is designed to display "Unknown" when API festival or band details are blank
    it('should display "Unknown" when festival or band details are missing', () => {
      cy.get('.festival-name').each(($el) => {
        if ($el.text().trim() === '') {
          cy.wrap($el).should('not.be.empty');
          cy.wrap($el).should('have.text', 'Unknown');
        }
      });

      cy.get('.band-container .band-name').each(($el) => {
        if ($el.text().trim() === '') {
          cy.wrap($el).should('not.be.empty');
          cy.wrap($el).should('have.text', 'Unknown');
        }
      });

      cy.get('.band-container .record-label').each(($el) => {
        if ($el.text().trim() === '') {
          cy.wrap($el).should('not.be.empty');
          cy.wrap($el).should('have.text', 'Unknown');
        }
      });
    });

    // negative scenario: what happens on the page when API throws 500
    it('should display an error message if API request fails', () => {
      cy.intercept('GET', API_URL, { statusCode: 500 }).as('apiFailure');
      cy.visit('http://localhost:3000/');
      cy.wait('@apiFailure');
      cy.contains('Something went wrong. Please try again later.').should('be.visible');
    });

    // validate festival details are expandable
    it('should expand and collapse festival details on click', () => {
      cy.get('.festival-name').first().as('firstFestival');

      // Ensure it's collapsed first
      cy.get('.band-container').should('not.exist');

      cy.get('@firstFestival').click();
      cy.get('.band-container').should('be.visible');
      
      cy.get('.festival-name').first().click();
      cy.get('.band-container').should('not.be.visible');
    });
  });
});